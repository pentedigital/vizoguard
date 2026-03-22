const { Router } = require("express");
const express = require("express");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { stmts } = require("../db");
const { sendLicenseEmail } = require("../email");
const outline = require("../outline");
const { webhookEventsTotal, emailSendsTotal } = require('../metrics');

const router = Router();
const INSTANCE = process.env.NODE_APP_INSTANCE || '0';

function getNodeApiUrlForLicense(license) {
  if (license.vpn_node_id) {
    const node = stmts.findNodeById.get(license.vpn_node_id);
    if (node) return node.api_url;
    console.warn(`[i${INSTANCE}] Node ${license.vpn_node_id} not found for license ${license.id} — falling back to default`);
  }
  return null;
}

function generateKey() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString("hex").toUpperCase());
  }
  return `VIZO-${segments.join("-")}`;
}

// Stripe requires raw body for signature verification
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).send("Missing stripe-signature header");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[i${INSTANCE}] Webhook signature verification failed:`, err.message);
    return res.status(400).send("Webhook signature verification failed");
  }

  // Event-level idempotency — atomic insert to prevent cluster TOCTOU race
  const eventInsert = stmts.insertEvent.run(event.id, event.type);
  if (eventInsert.changes === 0) {
    console.log(`[i${INSTANCE}] Duplicate event ${event.id}, skipping`);
    return res.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const email = session.customer_details?.email || session.customer_email;
        if (!email) {
          console.error(`[i${INSTANCE}] No email in checkout session`, session.id);
          break;
        }

        // Idempotency: skip if license already exists for this subscription or customer (#18)
        if (session.subscription) {
          const existing = stmts.findBySubscription.get(session.subscription);
          if (existing) {
            console.log(`[i${INSTANCE}] License already exists for subscription ${session.subscription}, skipping`);
            break;
          }
        } else if (session.customer) {
          const existing = stmts.findByCustomer.get(session.customer);
          if (existing) {
            console.log(`[i${INSTANCE}] License already exists for customer ${session.customer} (no subscription), skipping`);
            break;
          }
        }

        const plan = session.metadata?.plan;
        if (!plan || !["vpn", "security_vpn"].includes(plan)) {
          console.error(`[i${INSTANCE}] Invalid or missing plan in checkout session ${session.id}: ${plan}`);
          break;
        }
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        // Retry key generation on UNIQUE constraint collision (max 3 attempts)
        let licenseKey;
        for (let attempt = 0; attempt < 5; attempt++) {
          licenseKey = generateKey();
          try {
            stmts.insert.run({
              key: licenseKey,
              email,
              plan,
              customer: session.customer || null,
              subscription: session.subscription || null,
              expires_at: expiresAt.toISOString(),
            });
            break;
          } catch (insertErr) {
            // Duplicate subscription from cluster race — not an error (#3)
            if (insertErr.message.includes("UNIQUE") && insertErr.message.includes("stripe_subscription_id")) {
              console.log(`[i${INSTANCE}] Duplicate webhook for subscription ${session.subscription}, skipping`);
              return res.json({ received: true });
            }
            if (attempt === 4 || !insertErr.message.includes("UNIQUE")) throw insertErr;
            console.warn(`[i${INSTANCE}] Key collision on attempt ${attempt + 1}, retrying`);
          }
        }

        const redactedEmail = email.replace(/^.+@/, '***@');
        console.log(`[i${INSTANCE}] License created for ${redactedEmail} (plan: ${plan})`);
        stmts.insertAudit.run('license_created', 'license', licenseKey, `plan=${plan}`, null);

        // Respond to Stripe immediately — don't risk 20s timeout (#19)
        res.json({ received: true });

        // Guard against out-of-order events: verify subscription is still active
        if (session.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            if (sub.status !== 'active' && sub.status !== 'trialing') {
              stmts.reactivateStatus.run('expired', session.subscription);
              console.warn(`[i${INSTANCE}] Subscription ${session.subscription} already ${sub.status}, marking expired`);
            }
          } catch (subErr) {
            console.warn(`[i${INSTANCE}] Could not verify subscription status:`, subErr.message);
          }
        }

        // Auto-provision Outline VPN access key (async, fire-and-forget)
        let accessUrl = null;
        let newLicense = null;
        try {
          newLicense = stmts.findByKey.get(licenseKey);
          if (!newLicense) throw new Error("License not found after insert");
          const claim = stmts.claimOutlineSlot.run(newLicense.id);
          if (claim.changes === 0) {
            console.log(`[i${INSTANCE}] Outline key already claimed for license ${newLicense.id}, skipping`);
          } else {
            const bestNode = stmts.bestNode.get();
            const apiUrl = bestNode ? bestNode.api_url : null;
            const result = await outline.createAccessKey(email, apiUrl);
            try {
              const DATA_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB
              stmts.setOutlineKey.run(result.accessUrl, result.id, newLicense.id);
              if (bestNode) stmts.setLicenseNode.run(bestNode.id, newLicense.id);
              outline.setDataLimit(result.id, DATA_LIMIT_BYTES, apiUrl).catch(err => {
                console.error(`[i${INSTANCE}] Failed to set data limit for key ${result.id}:`, err.message);
              });
            } catch (innerErr) {
              await outline.deleteAccessKey(result.id, apiUrl).catch(() => {});
              throw innerErr;
            }
            accessUrl = result.accessUrl;
            console.log(`[i${INSTANCE}] Outline key provisioned (node=${bestNode ? bestNode.name : 'default'})`);
          }
        } catch (outlineErr) {
          if (newLicense) stmts.resetOutlineClaim.run(newLicense.id);
          console.error(`[i${INSTANCE}] Failed to create Outline key for license ${licenseKey}:`, outlineErr.stack || outlineErr);
          webhookEventsTotal.inc({ event_type: 'outline_provision_failed', result: 'error' });
        }

        // Email failure is logged but non-fatal since Stripe already got 200 (#15)
        try {
          await sendLicenseEmail(email, licenseKey, plan, accessUrl);
          emailSendsTotal.inc({ result: 'success' });
        } catch (emailErr) {
          emailSendsTotal.inc({ result: 'error' });
          console.error(`[i${INSTANCE}] Failed to send license email:`, emailErr.stack || emailErr);
        }
        webhookEventsTotal.inc({ event_type: event.type, result: 'success' });
        return; // Already responded above
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.billing_reason === "subscription_create") {
          webhookEventsTotal.inc({ event_type: event.type, result: 'skipped' });
          break; // handled by checkout.session.completed
        }

        const subId = invoice.subscription;
        if (!subId) break;

        // Use Stripe's actual period end instead of calculating from "now"
        let expiresAt;
        if (invoice.lines?.data?.[0]?.period?.end) {
          expiresAt = new Date(invoice.lines.data[0].period.end * 1000);
        } else {
          // Fallback: base on existing expiry, not current time (#32)
          const existing = stmts.findBySubscription.get(subId);
          const base = existing?.expires_at ? new Date(existing.expires_at) : new Date();
          base.setFullYear(base.getFullYear() + 1);
          expiresAt = base;
        }
        stmts.updateExpiry.run(expiresAt.toISOString(), subId);
        // Reactivate if suspended (payment recovered after failure) — guards against un-expiring deleted subs
        const renewResult = stmts.reactivateStatus.run("active", subId);
        if (renewResult.changes > 0) console.log(`[i${INSTANCE}] Subscription reactivated on renewal: ${subId}`);

        // Re-provision VPN key if it was revoked during suspension
        if (renewResult.changes > 0) {
          const reactivatedLicense = stmts.findBySubscription.get(subId);
          if (reactivatedLicense && !reactivatedLicense.outline_key_id) {
            stmts.resetStalePending.run(); // Clean up stale claims before CAS
            const claim = stmts.claimOutlineSlot.run(reactivatedLicense.id);
            if (claim.changes === 0) {
              console.log(`[i${INSTANCE}] Outline key already claimed for reactivated license ${reactivatedLicense.id}`);
            } else {
              let result;
              try {
                const bestNode = stmts.bestNode.get();
                const apiUrl = bestNode ? bestNode.api_url : null;
                result = await outline.createAccessKey(reactivatedLicense.email, apiUrl);
                const DATA_LIMIT_BYTES = 100 * 1024 * 1024 * 1024;
                outline.setDataLimit(result.id, DATA_LIMIT_BYTES, apiUrl).catch(err => {
                  console.error(`[i${INSTANCE}] Failed to set data limit on reactivation:`, err.message);
                });
                try {
                  stmts.setOutlineKey.run(result.accessUrl, result.id, reactivatedLicense.id);
                  if (bestNode) stmts.setLicenseNode.run(bestNode.id, reactivatedLicense.id);
                } catch (dbErr) {
                  await outline.deleteAccessKey(result.id, apiUrl).catch(() => {});
                  result = undefined;
                  throw dbErr;
                }
                console.log(`[i${INSTANCE}] VPN key re-provisioned on payment recovery for ${subId}`);
                stmts.insertAudit.run('vpn_key_reprovisioned', 'license', String(reactivatedLicense.id), `subscription=${subId}`, null);
              } catch (outlineErr) {
                if (result?.id) await outline.deleteAccessKey(result.id, apiUrl).catch(() => {});
                stmts.resetOutlineClaim.run(reactivatedLicense.id);
                console.error(`[i${INSTANCE}] Failed to re-provision VPN key on recovery:`, outlineErr.stack || outlineErr);
              }
            }
          }
        }

        console.log(`[i${INSTANCE}] Subscription renewed: ${subId}, new expiry: ${expiresAt.toISOString()}`);
        webhookEventsTotal.inc({ event_type: event.type, result: 'success' });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        const suspResult = stmts.updateStatus.run("suspended", subId);
        if (suspResult.changes === 0) console.warn(`[i${INSTANCE}] payment_failed: no license for subscription ${subId}`);

        // Revoke Outline VPN key on suspension to prevent continued access
        const suspendedLicense = stmts.findBySubscription.get(subId);
        if (suspendedLicense && suspendedLicense.outline_key_id) {
          try {
            const revokeApiUrl = getNodeApiUrlForLicense(suspendedLicense);
            await outline.deleteAccessKey(suspendedLicense.outline_key_id, revokeApiUrl);
            console.log(`[i${INSTANCE}] Outline key revoked on suspension for ${subId}`);
          } catch (err) {
            console.error(`[i${INSTANCE}] Failed to revoke Outline key on suspension:`, err.message);
          } finally {
            stmts.clearOutlineKey.run(suspendedLicense.id);
          }
        }

        stmts.insertAudit.run('license_suspended', 'subscription', subId, 'payment_failed', null);
        console.log(`[i${INSTANCE}] Payment failed for subscription ${subId}, status set to suspended`);
        webhookEventsTotal.inc({ event_type: event.type, result: 'success' });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const expiredLicense = stmts.findBySubscription.get(sub.id);
        const expResult = stmts.updateStatus.run("expired", sub.id);
        if (expResult.changes === 0) console.warn(`[i${INSTANCE}] subscription.deleted: no license for ${sub.id}`);

        // Revoke Outline VPN access (use correct node for multi-node)
        if (expiredLicense && expiredLicense.outline_key_id) {
          try {
            const revokeApiUrl = getNodeApiUrlForLicense(expiredLicense);
            await outline.deleteAccessKey(expiredLicense.outline_key_id, revokeApiUrl);
            console.log(`[i${INSTANCE}] Outline key revoked for subscription ${sub.id}`);
          } catch (err) {
            console.error(`[i${INSTANCE}] Failed to revoke Outline key:`, err.message);
          } finally {
            stmts.clearOutlineKey.run(expiredLicense.id);
          }
        }

        console.log(`[i${INSTANCE}] Subscription expired: ${sub.id}`);
        webhookEventsTotal.inc({ event_type: event.type, result: 'success' });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        // Stripe Charge doesn't have .subscription directly — get it via invoice
        let subId = null;
        if (charge.invoice) {
          try {
            const invoice = await stripe.invoices.retrieve(charge.invoice);
            subId = invoice.subscription;
          } catch (invErr) {
            console.error(`[i${INSTANCE}] charge.refunded: failed to retrieve invoice ${charge.invoice}:`, invErr.message);
          }
        }
        if (!subId) {
          console.warn(`[i${INSTANCE}] charge.refunded: no subscription found for charge ${charge.id}`);
          break;
        }

        const refundedLicense = stmts.findBySubscription.get(subId);
        const refResult = stmts.updateStatus.run("suspended", subId);
        if (refResult.changes === 0) console.warn(`[i${INSTANCE}] charge.refunded: no license for subscription ${subId}`);

        // Revoke Outline VPN key on refund
        if (refundedLicense && refundedLicense.outline_key_id) {
          try {
            const revokeApiUrl = getNodeApiUrlForLicense(refundedLicense);
            await outline.deleteAccessKey(refundedLicense.outline_key_id, revokeApiUrl);
            console.log(`[i${INSTANCE}] Outline key revoked on refund for ${subId}`);
          } catch (err) {
            console.error(`[i${INSTANCE}] Failed to revoke Outline key on refund:`, err.message);
          } finally {
            stmts.clearOutlineKey.run(refundedLicense.id);
          }
        }

        stmts.insertAudit.run('license_refunded', 'subscription', subId, 'charge_refunded', null);
        console.log(`[i${INSTANCE}] Charge refunded for subscription ${subId}, status set to suspended`);
        webhookEventsTotal.inc({ event_type: event.type, result: 'success' });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        let updResult;
        if (sub.cancel_at_period_end) {
          // Don't promote suspended licenses to cancelled — they need payment first
          const existing = stmts.findBySubscription.get(sub.id);
          if (existing && existing.status === 'suspended') {
            console.log(`[i${INSTANCE}] Subscription cancel ignored — license is suspended (needs payment): ${sub.id}`);
          } else {
            updResult = stmts.reactivateStatus.run("cancelled", sub.id);
            console.log(`[i${INSTANCE}] Subscription set to cancel at period end: ${sub.id}`);
          }
        } else if (sub.status === "active") {
          updResult = stmts.reactivateStatus.run("active", sub.id);
          console.log(`[i${INSTANCE}] Subscription reactivated: ${sub.id}`);
        } else if (sub.status === "past_due" || sub.status === "unpaid") {
          updResult = stmts.updateStatus.run("suspended", sub.id);
          console.log(`[i${INSTANCE}] Subscription suspended (${sub.status}): ${sub.id}`);
        } else {
          console.log(`[i${INSTANCE}] Subscription updated with unhandled status: ${sub.status} for ${sub.id}`);
        }
        if (updResult && updResult.changes === 0) {
          console.warn(`[i${INSTANCE}] subscription.updated: no license for ${sub.id}`);
        }

        // Detect plan change (upgrade/downgrade) from subscription metadata
        const newPlan = sub.metadata?.plan;
        if (newPlan && ["vpn", "security_vpn"].includes(newPlan)) {
          const planResult = stmts.updatePlan.run(newPlan, sub.id);
          if (planResult.changes > 0) {
            stmts.insertAudit.run('plan_changed', 'subscription', sub.id, `new_plan=${newPlan}`, null);
            console.log(`[i${INSTANCE}] Plan updated to ${newPlan} for ${sub.id}`);
          }
        }

        webhookEventsTotal.inc({ event_type: event.type, result: 'success' });
        break;
      }

      default:
        console.log(`[i${INSTANCE}] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[i${INSTANCE}] Error processing ${event.type}:`, err);
    webhookEventsTotal.inc({ event_type: event?.type || 'unknown', result: 'error' });
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal processing error" });
    }
  }

  res.json({ received: true });
});

module.exports = router;
