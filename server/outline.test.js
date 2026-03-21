"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const https = require("https");
const { EventEmitter } = require("events");

// Helper: build a fake ClientRequest-like object
function makeFakeReq() {
  const req = new EventEmitter();
  req.write = () => {};
  req.end = () => {};
  req.destroy = (err) => {
    req.emit("error", err);
  };
  return req;
}

// Helper: build a fake IncomingMessage-like object
function makeFakeRes(statusCode, body) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  // Emit data + end asynchronously so the callback chain is set up first
  setImmediate(() => {
    if (body !== undefined) res.emit("data", typeof body === "string" ? body : JSON.stringify(body));
    res.emit("end");
  });
  return res;
}

// Cache the real https.request so we can restore it after each test
const realRequest = https.request;

function restoreRequest() {
  https.request = realRequest;
}

// ── Re-import outline.js with a clean module cache each test ─────────────────
// We need to reload the module after tweaking env vars and mocks.
function loadOutline() {
  // Clear module cache so DEFAULT_API_URL is re-evaluated from env
  delete require.cache[require.resolve("./outline")];
  return require("./outline");
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("outline.js", () => {

  // ── 1. createAccessKey returns { id, accessUrl } ─────────────────────────
  it("createAccessKey returns {id, accessUrl}", async () => {
    process.env.OUTLINE_API_URL = "https://fake-outline:12345/secret";

    let callCount = 0;
    https.request = (_opts, cb) => {
      callCount++;
      const req = makeFakeReq();
      if (callCount === 1) {
        // POST /access-keys → return new key
        cb(makeFakeRes(200, { id: 42, accessUrl: "ss://example" }));
      } else {
        // PUT /access-keys/42/name → 200 OK
        cb(makeFakeRes(200, {}));
      }
      return req;
    };

    try {
      const { createAccessKey } = loadOutline();
      const result = await createAccessKey("mykey");
      assert.deepEqual(result, { id: "42", accessUrl: "ss://example" });
    } finally {
      restoreRequest();
      delete process.env.OUTLINE_API_URL;
    }
  });

  // ── 2. deleteAccessKey with a valid numeric ID succeeds ───────────────────
  it("deleteAccessKey with valid numeric ID resolves to null", async () => {
    process.env.OUTLINE_API_URL = "https://fake-outline:12345/secret";

    https.request = (_opts, cb) => {
      const req = makeFakeReq();
      cb(makeFakeRes(204, undefined));
      return req;
    };

    try {
      const { deleteAccessKey } = loadOutline();
      const result = await deleteAccessKey("7");
      assert.equal(result, undefined); // async function returns undefined when resolved
    } finally {
      restoreRequest();
      delete process.env.OUTLINE_API_URL;
    }
  });

  // ── 3. deleteAccessKey with invalid (non-numeric) ID throws ───────────────
  it("deleteAccessKey with non-numeric ID throws 'Invalid access key ID'", async () => {
    process.env.OUTLINE_API_URL = "https://fake-outline:12345/secret";

    try {
      const { deleteAccessKey } = loadOutline();
      await assert.rejects(
        () => deleteAccessKey("abc"),
        (err) => {
          assert.equal(err.message, "Invalid access key ID");
          return true;
        }
      );
    } finally {
      delete process.env.OUTLINE_API_URL;
    }
  });

  // ── 4. setDataLimit calls PUT with the correct body ───────────────────────
  it("setDataLimit sends PUT with correct JSON body", async () => {
    process.env.OUTLINE_API_URL = "https://fake-outline:12345/secret";

    let capturedOpts = null;
    let capturedPayload = "";

    https.request = (opts, cb) => {
      capturedOpts = opts;
      const req = makeFakeReq();
      // Capture written payload
      req.write = (chunk) => { capturedPayload += chunk; };
      req.end = () => {};
      cb(makeFakeRes(200, {}));
      return req;
    };

    try {
      const { setDataLimit } = loadOutline();
      await setDataLimit("3", 1073741824);

      assert.equal(capturedOpts.method, "PUT");
      assert.ok(capturedOpts.path.includes("/access-keys/3/data-limit"));
      const body = JSON.parse(capturedPayload);
      assert.deepEqual(body, { limit: { bytes: 1073741824 } });
    } finally {
      restoreRequest();
      delete process.env.OUTLINE_API_URL;
    }
  });

  // ── 5. Request times out after 10 s ──────────────────────────────────────
  it("request times out after 10s", { timeout: 15000 }, async () => {
    process.env.OUTLINE_API_URL = "https://fake-outline:12345/secret";

    https.request = (_opts, _cb) => {
      // Never call cb — response never arrives
      const req = makeFakeReq();
      // Override destroy: emit the error that setTimeout passes
      req.destroy = (err) => {
        setImmediate(() => req.emit("error", err));
      };
      return req;
    };

    try {
      const { getServer } = loadOutline();
      await assert.rejects(
        () => getServer(),
        (err) => {
          assert.ok(
            err.message.includes("timed out"),
            `Expected timeout error, got: ${err.message}`
          );
          return true;
        }
      );
    } finally {
      restoreRequest();
      delete process.env.OUTLINE_API_URL;
    }
  });

  // ── 6. Calling with undefined apiUrl and no env var rejects ───────────────
  it("call with undefined apiUrl and no env var rejects with 'Outline API URL not configured'", async () => {
    // Ensure the env var is absent
    delete process.env.OUTLINE_API_URL;

    // Reload so DEFAULT_API_URL picks up the absent env var
    const { getServer } = loadOutline();

    await assert.rejects(
      () => getServer(undefined),
      (err) => {
        assert.equal(err.message, "Outline API URL not configured");
        return true;
      }
    );
  });

});
