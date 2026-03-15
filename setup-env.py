#!/usr/bin/env python3
"""
Vizoguard Environment Setup Script
Automates creation of Stripe products/prices/webhooks and .env configuration.
Run: python3 setup-env.py
"""

import os
import sys
import subprocess
import smtplib

ENV_PATH = os.path.join(os.path.dirname(__file__), "server", ".env")
APP_URL = "https://vizoguard.com"
WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "customer.subscription.deleted",
    "customer.subscription.updated",
]


def load_env():
    """Load existing .env into a dict."""
    env = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    env[key.strip()] = val.strip()
    return env


def save_env(env):
    """Write env dict back to .env file."""
    lines = []
    lines.append("PORT=3000")
    lines.append("NODE_ENV=production")
    lines.append("")
    lines.append("# Stripe")
    lines.append(f"STRIPE_SECRET_KEY={env.get('STRIPE_SECRET_KEY', '')}")
    lines.append(f"STRIPE_WEBHOOK_SECRET={env.get('STRIPE_WEBHOOK_SECRET', '')}")
    lines.append(f"STRIPE_PRICE_VPN={env.get('STRIPE_PRICE_VPN', '')}")
    lines.append(f"STRIPE_PRICE_SECURITY_VPN={env.get('STRIPE_PRICE_SECURITY_VPN', '')}")
    lines.append("")
    lines.append("# SMTP (Hostinger)")
    lines.append(f"SMTP_HOST={env.get('SMTP_HOST', 'smtp.hostinger.com')}")
    lines.append(f"SMTP_PORT={env.get('SMTP_PORT', '465')}")
    lines.append(f"SMTP_USER={env.get('SMTP_USER', 'support@vizoguard.com')}")
    lines.append(f"SMTP_PASS={env.get('SMTP_PASS', '')}")
    lines.append("")
    lines.append("# App")
    lines.append(f"APP_URL={env.get('APP_URL', APP_URL)}")
    lines.append(f"DB_PATH={env.get('DB_PATH', '/root/vizoguard/data/vizoguard.db')}")
    lines.append("")
    lines.append("# Outline VPN")
    lines.append(f"OUTLINE_API_URL={env.get('OUTLINE_API_URL', '')}")

    with open(ENV_PATH, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(ENV_PATH, 0o600)
    print(f"  Written to {ENV_PATH}")


def setup_stripe(env):
    """Create Stripe products, prices, and webhook endpoint."""
    import stripe

    sk = env.get("STRIPE_SECRET_KEY", "")
    if not sk or sk.startswith("sk_live_...") or len(sk) < 20:
        sk = input("  Enter STRIPE_SECRET_KEY (sk_live_...): ").strip()
        env["STRIPE_SECRET_KEY"] = sk

    stripe.api_key = sk

    # Verify key works
    try:
        stripe.Account.retrieve()
        print("  ✓ Stripe API key valid")
    except stripe.error.AuthenticationError:
        print("  ✗ Invalid Stripe API key")
        return False

    # --- Products & Prices ---
    # Check if prices already exist
    vpn_price = env.get("STRIPE_PRICE_VPN", "")
    sec_price = env.get("STRIPE_PRICE_SECURITY_VPN", "")

    if vpn_price and not vpn_price.startswith("price_..."):
        try:
            stripe.Price.retrieve(vpn_price)
            print(f"  ✓ VPN price exists: {vpn_price}")
        except Exception:
            vpn_price = ""

    if sec_price and not sec_price.startswith("price_..."):
        try:
            stripe.Price.retrieve(sec_price)
            print(f"  ✓ Security+VPN price exists: {sec_price}")
        except Exception:
            sec_price = ""

    # Search for existing products
    if not vpn_price or vpn_price.startswith("price_..."):
        existing = stripe.Product.search(query="name~'Basic'", limit=5)
        for p in existing.data:
            if "basic" in p.name.lower() or "vpn" in p.name.lower():
                prices = stripe.Price.list(product=p.id, active=True, limit=1)
                if prices.data:
                    vpn_price = prices.data[0].id
                    print(f"  ✓ Found existing VPN price: {vpn_price} ({p.name})")
                    break

    if not sec_price or sec_price.startswith("price_..."):
        existing = stripe.Product.search(query="name~'Pro'", limit=5)
        for p in existing.data:
            if "pro" in p.name.lower() or "security" in p.name.lower():
                prices = stripe.Price.list(product=p.id, active=True, limit=1)
                if prices.data:
                    sec_price = prices.data[0].id
                    print(f"  ✓ Found existing Pro price: {sec_price} ({p.name})")
                    break

    # Create if not found
    if not vpn_price or vpn_price.startswith("price_..."):
        print("  Creating Vizoguard Basic product + price...")
        product = stripe.Product.create(
            name="Vizoguard Basic",
            description="Encrypted VPN — 1 device, 100 GB/month, zero-logging",
        )
        price = stripe.Price.create(
            product=product.id,
            unit_amount=1999,  # $19.99
            currency="usd",
            recurring={"interval": "year"},
        )
        vpn_price = price.id
        print(f"  ✓ Created VPN price: {vpn_price}")

    if not sec_price or sec_price.startswith("price_..."):
        print("  Creating Vizoguard Pro product + price...")
        product = stripe.Product.create(
            name="Vizoguard Pro",
            description="AI security + VPN — threat blocking, phishing detection, connection monitoring",
        )
        price = stripe.Price.create(
            product=product.id,
            unit_amount=9999,  # $99.99
            currency="usd",
            recurring={"interval": "year"},
        )
        sec_price = price.id
        print(f"  ✓ Created Pro price: {sec_price}")

    env["STRIPE_PRICE_VPN"] = vpn_price
    env["STRIPE_PRICE_SECURITY_VPN"] = sec_price

    # --- Webhook ---
    webhook_secret = env.get("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret or webhook_secret.startswith("whsec_..."):
        webhook_url = f"{APP_URL}/api/webhook"

        # Check for existing webhook
        existing_hooks = stripe.WebhookEndpoint.list(limit=20)
        for wh in existing_hooks.data:
            if wh.url == webhook_url and wh.status == "enabled":
                print(f"  ✓ Webhook already exists: {wh.id}")
                print(f"  ⚠ Cannot retrieve existing secret — delete and recreate, or enter manually.")
                webhook_secret = input("  Enter STRIPE_WEBHOOK_SECRET (whsec_...) or press Enter to recreate: ").strip()
                if webhook_secret:
                    env["STRIPE_WEBHOOK_SECRET"] = webhook_secret
                    return True
                # Delete old one to recreate
                stripe.WebhookEndpoint.delete(wh.id)
                print(f"  Deleted old webhook {wh.id}")
                break

        if not webhook_secret or webhook_secret.startswith("whsec_..."):
            print(f"  Creating webhook endpoint: {webhook_url}")
            wh = stripe.WebhookEndpoint.create(
                url=webhook_url,
                enabled_events=WEBHOOK_EVENTS,
            )
            webhook_secret = wh.secret
            print(f"  ✓ Webhook created: {wh.id}")
            print(f"  ✓ Webhook secret: {webhook_secret[:12]}...")

    env["STRIPE_WEBHOOK_SECRET"] = webhook_secret
    return True


def setup_smtp(env):
    """Test SMTP credentials."""
    smtp_pass = env.get("SMTP_PASS", "")
    if not smtp_pass or smtp_pass == "your-email-password":
        smtp_pass = input("  Enter SMTP_PASS (Hostinger email password for support@vizoguard.com): ").strip()
        if not smtp_pass:
            print("  ⚠ Skipped — email sending will not work")
            return

    env["SMTP_PASS"] = smtp_pass

    host = env.get("SMTP_HOST", "smtp.hostinger.com")
    port = int(env.get("SMTP_PORT", "465"))
    user = env.get("SMTP_USER", "support@vizoguard.com")

    print(f"  Testing SMTP connection to {host}:{port}...")
    try:
        with smtplib.SMTP_SSL(host, port, timeout=10) as server:
            server.login(user, smtp_pass)
        print("  ✓ SMTP login successful")
    except Exception as e:
        print(f"  ✗ SMTP test failed: {e}")
        print("  ⚠ Continuing anyway — check password later")


def setup_outline(env):
    """Validate Outline VPN API URL."""
    import urllib.request
    import ssl
    import json

    url = env.get("OUTLINE_API_URL", "")
    if not url or url.startswith("https://your-"):
        url = input("  Enter OUTLINE_API_URL (from Outline Manager, e.g. https://host:port/secret): ").strip()
        if not url:
            print("  ⚠ Skipped — VPN provisioning will not work")
            return

    env["OUTLINE_API_URL"] = url

    print(f"  Testing Outline API: {url[:40]}...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(f"{url}/server")
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read())
            print(f"  ✓ Outline server: {data.get('name', 'unknown')} v{data.get('version', '?')}")
    except Exception as e:
        print(f"  ✗ Outline API test failed: {e}")
        print("  ⚠ Continuing anyway — check URL later")


def restart_pm2():
    """Restart the API server."""
    print("  Restarting PM2...")
    result = subprocess.run(["pm2", "restart", "vizoguard-api"], capture_output=True, text=True)
    if result.returncode == 0:
        print("  ✓ PM2 restarted")
    else:
        print(f"  ⚠ PM2 restart failed: {result.stderr.strip()}")


def verify_api():
    """Quick health check."""
    import urllib.request
    import json

    try:
        with urllib.request.urlopen(f"{APP_URL}/api/health", timeout=5) as resp:
            data = json.loads(resp.read())
            if data.get("status") == "ok":
                print("  ✓ API healthy")
                return True
    except Exception as e:
        print(f"  ✗ API health check failed: {e}")
    return False


def main():
    print("=" * 50)
    print("  Vizoguard Environment Setup")
    print("=" * 50)
    print()

    env = load_env()

    # 1. Stripe
    print("[1/5] Stripe (products, prices, webhook)")
    if not setup_stripe(env):
        print("  ⚠ Stripe setup failed — continuing with other steps")
    print()

    # 2. SMTP
    print("[2/5] SMTP (email)")
    setup_smtp(env)
    print()

    # 3. Outline VPN
    print("[3/5] Outline VPN")
    setup_outline(env)
    print()

    # 4. Save .env
    print("[4/5] Saving .env")
    save_env(env)
    print()

    # 5. Restart & verify
    print("[5/5] Restart & verify")
    restart_pm2()
    import time
    time.sleep(2)
    verify_api()
    print()

    # Summary
    print("=" * 50)
    print("  Setup Complete — Summary")
    print("=" * 50)
    checks = {
        "STRIPE_SECRET_KEY": env.get("STRIPE_SECRET_KEY", "")[:10] + "..." if len(env.get("STRIPE_SECRET_KEY", "")) > 10 else "MISSING",
        "STRIPE_WEBHOOK_SECRET": env.get("STRIPE_WEBHOOK_SECRET", "")[:12] + "..." if len(env.get("STRIPE_WEBHOOK_SECRET", "")) > 12 else "MISSING",
        "STRIPE_PRICE_VPN": env.get("STRIPE_PRICE_VPN", "") or "MISSING",
        "STRIPE_PRICE_SECURITY_VPN": env.get("STRIPE_PRICE_SECURITY_VPN", "") or "MISSING",
        "SMTP_PASS": "set" if env.get("SMTP_PASS") and env["SMTP_PASS"] != "your-email-password" else "MISSING",
        "OUTLINE_API_URL": env.get("OUTLINE_API_URL", "")[:30] + "..." if len(env.get("OUTLINE_API_URL", "")) > 30 else env.get("OUTLINE_API_URL", "") or "MISSING",
    }

    all_good = True
    for key, val in checks.items():
        status = "✓" if val != "MISSING" else "✗"
        if val == "MISSING":
            all_good = False
        print(f"  {status} {key}: {val}")

    print()
    if all_good:
        print("  All environment variables configured!")
    else:
        print("  Some variables still missing — re-run this script or edit .env manually:")
        print(f"    nano {ENV_PATH}")
    print()


if __name__ == "__main__":
    main()
