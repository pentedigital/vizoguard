const { Router } = require("express");
const express = require("express");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { stmts } = require("../db");
const { sendLicenseEmail } = require("../email");
const outline = require("../outline");

const router = Router();

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
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send("Webhook signature verification failed");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const email = session.customer_details?.email || session.customer_email;
        if (!email) {
          console.error("No email in checkout session", session.id);
          break;
        }

        // Idempotency: skip if license already exists for this subscription
        if (session.subscription) {
          const existing = stmts.findBySubscription.get(session.subscription);
          if (existing) {
            console.log(`License already exists for subscription ${session.subscription}, skipping`);
            break;
          }
        }

        const plan = session.metadata?.plan;
        if (!plan || !["vpn", "security_vpn"].includes(plan)) {
          console.error(`Invalid or missing plan in checkout session ${session.id}: ${plan}`);
          break;
        }
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        // Retry key generation on UNIQUE constraint collision (max 3 attempts)
        let licenseKey;
        for (let attempt = 0; attempt < 3; attempt++) {
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
            if (attempt === 2 || !insertErr.message.includes("UNIQUE")) throw insertErr;
            console.warn(`Key collision on attempt ${attempt + 1}, retrying`);
          }
        }

        console.log(`License created for ${email} (plan: ${plan})`);

        // Auto-provision Outline VPN access key (picks best node)
        let accessUrl = null;
        try {
          const newLicense = stmts.findByKey.get(licenseKey);
          if (!newLicense) throw new Error("License not found after insert");
          const bestNode = stmts.bestNode.get();
          const apiUrl = bestNode ? bestNode.api_url : null;
          const result = await outline.createAccessKey(email, apiUrl);
          const DATA_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB
          await outline.setDataLimit(result.id, DATA_LIMIT_BYTES, apiUrl);
          stmts.setOutlineKey.run(result.accessUrl, result.id, newLicense.id);
          if (bestNode) stmts.setLicenseNode.run(bestNode.id, newLicense.id);
          accessUrl = result.accessUrl;
          console.log(`Outline key provisioned (node=${bestNode ? bestNode.name : 'default'})`);
        } catch (outlineErr) {
          console.error("Failed to create Outline key:", outlineErr.message);
        }

        try {
          await sendLicenseEmail(email, licenseKey, plan, accessUrl);
          console.log(`License email sent to ${email}`);
        } catch (emailErr) {
          console.error("Failed to send license email:", emailErr.message);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.billing_reason === "subscription_create") break; // handled by checkout.session.completed

        const subId = invoice.subscription;
        if (!subId) break;

        // Use Stripe's actual period end instead of calculating from "now"
        let expiresAt;
        if (invoice.lines?.data?.[0]?.period?.end) {
          expiresAt = new Date(invoice.lines.data[0].period.end * 1000);
        } else {
          expiresAt = new Date();
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        }
        stmts.updateExpiry.run(expiresAt.toISOString(), subId);
        console.log(`Subscription renewed: ${subId}, new expiry: ${expiresAt.toISOString()}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        stmts.updateStatus.run("suspended", subId);

        // Revoke Outline VPN key on suspension to prevent continued access
        const suspendedLicense = stmts.findBySubscription.get(subId);
        if (suspendedLicense && suspendedLicense.outline_key_id) {
          try {
            let revokeApiUrl = null;
            if (suspendedLicense.vpn_node_id) {
              const node = stmts.findNodeById.get(suspendedLicense.vpn_node_id);
              if (node) revokeApiUrl = node.api_url;
            }
            await outline.deleteAccessKey(suspendedLicense.outline_key_id, revokeApiUrl);
            stmts.clearOutlineKey.run(suspendedLicense.id);
            console.log(`Outline key revoked on suspension for ${subId}`);
          } catch (err) {
            console.error("Failed to revoke Outline key on suspension:", err.message);
          }
        }

        console.log(`Payment failed for subscription ${subId}, status set to suspended`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const expiredLicense = stmts.findBySubscription.get(sub.id);
        stmts.updateStatus.run("expired", sub.id);

        // Revoke Outline VPN access (use correct node for multi-node)
        if (expiredLicense && expiredLicense.outline_key_id) {
          try {
            let revokeApiUrl = null;
            if (expiredLicense.vpn_node_id) {
              const node = stmts.findNodeById.get(expiredLicense.vpn_node_id);
              if (node) revokeApiUrl = node.api_url;
            }
            await outline.deleteAccessKey(expiredLicense.outline_key_id, revokeApiUrl);
            stmts.clearOutlineKey.run(expiredLicense.id);
            console.log(`Outline key revoked for subscription ${sub.id}`);
          } catch (err) {
            console.error("Failed to revoke Outline key:", err.message);
          }
        }

        console.log(`Subscription expired: ${sub.id}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        if (sub.cancel_at_period_end) {
          stmts.updateStatus.run("cancelled", sub.id);
          console.log(`Subscription set to cancel at period end: ${sub.id}`);
        } else if (sub.status === "active") {
          stmts.updateStatus.run("active", sub.id);
        } else if (sub.status === "past_due" || sub.status === "unpaid") {
          stmts.updateStatus.run("suspended", sub.id);
        }
        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    // Return 500 so Stripe retries on real failures (exponential backoff, 72h window)
    return res.status(500).json({ error: "Internal processing error" });
  }

  res.json({ received: true });
});

module.exports = router;
