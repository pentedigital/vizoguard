const https = require("https");

const DEFAULT_API_URL = process.env.OUTLINE_API_URL;

function outlineFetch(apiUrl, path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    if (!apiUrl) return reject(new Error("Outline API URL not configured"));

    const url = new URL(`${apiUrl}${path}`);
    const payload = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      rejectUnauthorized: false, // Outline uses self-signed cert; URL contains secret prefix for auth
      headers: {},
    };

    if (payload) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        clearTimeout(timeout);
        if (method === "DELETE" && (res.statusCode === 204 || res.statusCode === 200)) {
          return resolve(null);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Outline API ${method} failed: ${res.statusCode}`));
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch (e) {
          reject(new Error(`Outline API returned invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });

    const timeout = setTimeout(() => {
      req.destroy(new Error(`Outline API ${method} timed out after 10s`));
    }, 10000);
    req.on("error", (err) => { clearTimeout(timeout); reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

// All functions accept optional apiUrl parameter for multi-node support
// Falls back to DEFAULT_API_URL (from .env) for backward compatibility

async function createAccessKey(name, apiUrl) {
  const url = apiUrl || DEFAULT_API_URL;
  const key = await outlineFetch(url, "/access-keys", "POST");
  if (name) {
    await outlineFetch(url, `/access-keys/${key.id}/name`, "PUT", { name });
  }
  return { id: String(key.id), accessUrl: key.accessUrl };
}

async function deleteAccessKey(id, apiUrl) {
  if (!/^\d+$/.test(String(id))) throw new Error("Invalid access key ID");
  await outlineFetch(apiUrl || DEFAULT_API_URL, `/access-keys/${id}`, "DELETE");
}

async function listAccessKeys(apiUrl) {
  const data = await outlineFetch(apiUrl || DEFAULT_API_URL, "/access-keys");
  return data.accessKeys || [];
}

async function setDataLimit(keyId, bytes, apiUrl) {
  if (!/^\d+$/.test(String(keyId))) throw new Error("Invalid access key ID");
  await outlineFetch(apiUrl || DEFAULT_API_URL, `/access-keys/${keyId}/data-limit`, "PUT", { limit: { bytes } });
}

async function getServer(apiUrl) {
  return outlineFetch(apiUrl || DEFAULT_API_URL, "/server");
}

module.exports = { createAccessKey, deleteAccessKey, listAccessKeys, getServer, setDataLimit };
