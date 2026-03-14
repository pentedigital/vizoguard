const https = require("https");

const API_URL = process.env.OUTLINE_API_URL;

function outlineFetch(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    if (!API_URL) return reject(new Error("OUTLINE_API_URL not configured"));

    const url = new URL(`${API_URL}${path}`);
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
        if (method === "DELETE" && (res.statusCode === 204 || res.statusCode === 200)) {
          return resolve(null);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Outline API ${method} ${path}: ${res.statusCode} ${data}`));
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch (e) {
          reject(new Error(`Outline API returned invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createAccessKey(name) {
  const key = await outlineFetch("/access-keys", "POST");
  if (name) {
    await outlineFetch(`/access-keys/${key.id}/name`, "PUT", { name });
  }
  return { id: String(key.id), accessUrl: key.accessUrl };
}

async function deleteAccessKey(id) {
  await outlineFetch(`/access-keys/${id}`, "DELETE");
}

async function listAccessKeys() {
  const data = await outlineFetch("/access-keys");
  return data.accessKeys || [];
}

async function setDataLimit(keyId, bytes) {
  await outlineFetch(`/access-keys/${keyId}/data-limit`, "PUT", { limit: { bytes } });
}

async function getServer() {
  return outlineFetch("/server");
}

module.exports = { createAccessKey, deleteAccessKey, listAccessKeys, getServer, setDataLimit };
