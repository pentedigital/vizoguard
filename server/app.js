require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const webhookRouter = require("./routes/webhook");
const licenseRouter = require("./routes/license");
const vpnRouter = require("./routes/vpn");

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe webhook MUST come before express.json() — needs raw body
app.use("/api/webhook", webhookRouter);

// Global middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    "https://vizoguard.com",
    "https://www.vizoguard.com",
  ],
}));
app.use(express.json());

// License API
app.use("/api/license", licenseRouter);

// VPN API
app.use("/api/vpn", vpnRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Vizoguard API listening on 127.0.0.1:${PORT}`);
});
