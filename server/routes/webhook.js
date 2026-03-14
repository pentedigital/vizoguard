const { Router } = require("express");
const express = require("express");
const crypto = require("crypto");
const { stmts } = require("../db");
const { sendLicenseEmail } = require("../email");

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
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];

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

        const licenseKey = generateKey();
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        stmts.insert.run({
          key: licenseKey,
          email,
          customer: session.customer || null,
          subscription: session.subscription || null,
          expires_at: expiresAt.toISOString(),
        });

        console.log(`License created: ${licenseKey} for ${email}`);

        try {
          await sendLicenseEmail(email, licenseKey);
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

        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        stmts.updateExpiry.run(expiresAt.toISOString(), subId);
        console.log(`Subscription renewed: ${subId}, new expiry: ${expiresAt.toISOString()}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        stmts.updateStatus.run("expired", sub.id);
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
    return res.status(500).json({ error: "Internal processing error" });
  }

  res.json({ received: true });
});

module.exports = router;
