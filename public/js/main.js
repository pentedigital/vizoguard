// ── Stripe Checkout ──────────────────────────
// Replace with your live publishable key and price ID
const STRIPE_PK = "pk_test_REPLACE_ME";
const PRICE_ID = "price_REPLACE_ME";

const stripe = Stripe(STRIPE_PK);

async function startCheckout() {
  try {
    const { error } = await stripe.redirectToCheckout({
      lineItems: [{ price: PRICE_ID, quantity: 1 }],
      mode: "subscription",
      successUrl: window.location.origin + "/thank-you.html?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: window.location.origin,
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
      // Close all
      document.querySelectorAll(".faq-item").forEach((i) => i.classList.remove("open"));
      // Toggle clicked
      if (!wasOpen) item.classList.add("open");
    });
  });
});
