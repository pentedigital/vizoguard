const https = require("https");

let outlineApiDuration, outlineApiTotal;
try {
  const metrics = require('./metrics');
  outlineApiDuration = metrics.outlineApiDuration;
  outlineApiTotal = metrics.outlineApiTotal;
} catch { /* metrics not available in test */ }

const DEFAULT_API_URL = process.env.OUTLINE_API_URL;

// Circuit breaker constants
const CB_THRESHOLD = 5;
const CB_TIMEOUT_MS = 30000;

// SQLite-backed circuit breaker (shared across PM2 cluster instances via prepared stmts)
let cbStmts;
try { cbStmts = require('./db').stmts; } catch { /* db not available in test */ }

function getCBState() {
  if (!cbStmts) return { failures: 0, state: 'closed', opened_at: 0 };
  return cbStmts.getCB.get('outline') || { failures: 0, state: 'closed', opened_at: 0 };
}
function updateCBState(failures, state, openedAt) {
  if (cbStmts) cbStmts.updateCB.run(failures, state, openedAt, 'outline');
}

function outlineFetch(apiUrl, path, method = "GET", body = null) {
  if (!apiUrl) return Promise.reject(new Error("Outline API URL not configured"));

  // Circuit breaker check (DB-backed, shared across cluster)
  let cb = getCBState();
  if (cb.state === "open") {
    if (Date.now() - cb.opened_at >= CB_TIMEOUT_MS) {
      cb.state = "half-open";
      updateCBState(cb.failures, "half-open", cb.opened_at);
    } else {
      return Promise.reject(new Error("Outline API circuit breaker open"));
    }
  }

  const wasHalfOpen = cb.state === "half-open";

  return new Promise((resolve, reject) => {
    const url = new URL(`${apiUrl}${path}`);
    const payload = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      // SECURITY: rejectUnauthorized bypassed ONLY for self-signed Outline server certs.
      // The API URL contains a secret prefix that serves as authentication.
      // vpn_nodes.api_url must NEVER be user-settable — compromise of that table
      // would allow redirecting management calls to an attacker-controlled server.
      rejectUnauthorized: false,
      headers: {},
    };

    if (payload) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("error", (err) => { clearTimeout(timeout); reject(err); });
      res.on("end", () => {
        clearTimeout(timeout);
        if (method === "DELETE" && (res.statusCode === 204 || res.statusCode === 200 || res.statusCode === 404)) {
          return resolve(null);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Outline API ${method} failed: ${res.statusCode}`));
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch (e) {
          reject(new Error("Outline API returned invalid JSON"));
        }
      });
    });

    const timeout = setTimeout(() => {
      req.destroy(new Error(`Outline API ${method} timed out after 10s`));
    }, 10000);
    req.on("error", (err) => { clearTimeout(timeout); reject(err); });
    if (payload) req.write(payload);
    req.end();
  }).then((result) => {
    // Success: reset circuit breaker
    updateCBState(0, "closed", 0);
    return result;
  }, (err) => {
    // Failure: update circuit breaker
    const current = getCBState();
    const newFailures = current.failures + 1;
    if (wasHalfOpen || newFailures >= CB_THRESHOLD) {
      updateCBState(newFailures, "open", Date.now());
    } else {
      updateCBState(newFailures, current.state, current.opened_at);
    }
    throw err;
  });
}

// All functions accept optional apiUrl parameter for multi-node support
// Falls back to DEFAULT_API_URL (from .env) for backward compatibility

async function createAccessKey(name, apiUrl) {
  const start = process.hrtime.bigint();
  try {
    const url = apiUrl || DEFAULT_API_URL;
    const key = await outlineFetch(url, "/access-keys", "POST");
    if (!key || !key.id || !key.accessUrl) {
      throw new Error("Outline API returned incomplete key response");
    }
    if (name) {
      try {
        await outlineFetch(url, `/access-keys/${key.id}/name`, "PUT", { name });
      } catch (nameErr) {
        console.warn(`[outline] Failed to set key name (non-fatal):`, nameErr.message);
      }
    }
    if (outlineApiTotal) outlineApiTotal.inc({ operation: 'createAccessKey', result: 'success' });
    return { id: String(key.id), accessUrl: key.accessUrl };
  } catch (err) {
    if (outlineApiTotal) outlineApiTotal.inc({ operation: 'createAccessKey', result: 'error' });
    throw err;
  } finally {
    if (outlineApiDuration) outlineApiDuration.observe({ method: 'POST', operation: 'createAccessKey' }, Number(process.hrtime.bigint() - start) / 1e9);
  }
}

async function deleteAccessKey(id, apiUrl) {
  if (!/^\d+$/.test(String(id)) || String(id) === '0') throw new Error("Invalid access key ID");
  const start = process.hrtime.bigint();
  try {
    await outlineFetch(apiUrl || DEFAULT_API_URL, `/access-keys/${id}`, "DELETE");
    if (outlineApiTotal) outlineApiTotal.inc({ operation: 'deleteAccessKey', result: 'success' });
  } catch (err) {
    if (outlineApiTotal) outlineApiTotal.inc({ operation: 'deleteAccessKey', result: 'error' });
    throw err;
  } finally {
    if (outlineApiDuration) outlineApiDuration.observe({ method: 'DELETE', operation: 'deleteAccessKey' }, Number(process.hrtime.bigint() - start) / 1e9);
  }
}

async function listAccessKeys(apiUrl) {
  const data = await outlineFetch(apiUrl || DEFAULT_API_URL, "/access-keys");
  return data.accessKeys || [];
}

async function setDataLimit(keyId, bytes, apiUrl) {
  if (!/^\d+$/.test(String(keyId)) || String(keyId) === '0') throw new Error("Invalid access key ID");
  await outlineFetch(apiUrl || DEFAULT_API_URL, `/access-keys/${keyId}/data-limit`, "PUT", { limit: { bytes } });
}

async function getServer(apiUrl) {
  return outlineFetch(apiUrl || DEFAULT_API_URL, "/server");
}

module.exports = { createAccessKey, deleteAccessKey, listAccessKeys, getServer, setDataLimit };
