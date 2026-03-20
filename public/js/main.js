// ── Stripe Checkout (server-side session) ────
var _checkoutBusy = false;
async function startCheckout(plan) {
  if (_checkoutBusy) return;
  _checkoutBusy = true;

  // Add loading state to all buttons for this plan
  var btns = document.querySelectorAll('[onclick*="' + plan + '"]');
  btns.forEach(function(b){ b.classList.add('loading'); b.dataset.origText = b.textContent; b.textContent = 'Redirecting...'; });

  try {
    var lang = document.documentElement.lang || 'en';
    var planLabel = plan === 'security_vpn' ? 'Pro' : 'Basic';
    var planValue = plan === 'security_vpn' ? 99.99 : 24.99;
    gtag('event', 'begin_checkout', {
      'currency': 'USD',
      'value': planValue,
      'items': [{ 'item_name': 'Vizoguard ' + planLabel, 'price': planValue, 'quantity': 1 }],
      'language': lang
    });
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Something went wrong. Please try again.");
      _resetBtns(btns);
      return;
    }
    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Something went wrong. Please try again.");
      _resetBtns(btns);
    }
  } catch (err) {
    console.error("Checkout error:", err);
    alert("Something went wrong. Please try again.");
    _resetBtns(btns);
  }
}
function _resetBtns(btns){
  _checkoutBusy = false;
  btns.forEach(function(b){ b.classList.remove('loading'); b.textContent = b.dataset.origText || b.textContent; });
}

// ── FAQ accordion ────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach((i) => {
        i.classList.remove("open");
        i.querySelector(".faq-question").setAttribute("aria-expanded", "false");
      });
      if (!wasOpen) {
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  // ── Scroll-triggered animations ──────────────
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );

  document.querySelectorAll(".animate-up").forEach((el) => {
    observer.observe(el);
  });
});
