// ── Stripe Checkout ──────────────────────────
// Replace with your live keys
const STRIPE_PK = "pk_test_REPLACE_ME";

// Two Stripe Price IDs — create both in Stripe Dashboard
const PRICE_IDS = {
  vpn: "price_VPN_REPLACE_ME",             // $19.99/yr
  security_vpn: "price_SECURITY_REPLACE_ME", // $99.99/yr
};

const stripe = Stripe(STRIPE_PK);

async function startCheckout(plan) {
  const priceId = PRICE_IDS[plan];
  if (!priceId || priceId.includes("REPLACE_ME")) {
    alert("Checkout is being set up. Please try again soon.");
    return;
  }

  try {
    const { error } = await stripe.redirectToCheckout({
      lineItems: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      successUrl: window.location.origin + "/thank-you.html?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: window.location.origin + "#pricing",
      clientReferenceId: plan,
    });
    if (error) {
      console.error("Checkout error:", error.message);
      alert("Something went wrong. Please try again.");
    }
  } catch (err) {
    console.error("Checkout error:", err);
    alert("Something went wrong. Please try again.");
  }
}

// ── FAQ accordion ────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach((i) => i.classList.remove("open"));
      if (!wasOpen) item.classList.add("open");
    });
  });
});
