#!/usr/bin/env node

/*
 * Post-deploy smoke test for web API connectivity.
 *
 * Usage:
 *   node scripts/smoke-web-api.mjs --base-url https://portfolioproapp.com
 *
 * Env alternatives:
 *   SMOKE_BASE_URL=https://portfolioproapp.com
 *   SMOKE_ORIGIN=https://portfolioproapp.com
 *   SMOKE_BEARER_TOKEN=<optional jwt>
 */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") out.baseUrl = argv[i + 1];
    if (arg === "--origin") out.origin = argv[i + 1];
    if (arg === "--token") out.token = argv[i + 1];
  }
  return out;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

async function callJson(url, options = {}) {
  const timeoutMs = 12000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, text, json };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.baseUrl || process.env.SMOKE_BASE_URL || "");
  const origin = String(args.origin || process.env.SMOKE_ORIGIN || baseUrl || "https://portfolioproapp.com");
  const token = String(args.token || process.env.SMOKE_BEARER_TOKEN || "").trim();

  if (!baseUrl) {
    console.error("[smoke] Missing base URL. Pass --base-url or SMOKE_BASE_URL.");
    process.exit(2);
  }

  console.info("[smoke] Base URL:", baseUrl);
  console.info("[smoke] Origin:", origin);

  // 1) Health endpoint must be reachable and return ok
  const healthUrl = `${baseUrl}/api/health`;
  const health = await callJson(healthUrl, {
    method: "GET",
    headers: { Origin: origin, Accept: "application/json" },
  });

  if (!health.response.ok) {
    console.error("[smoke] FAIL /api/health status:", health.response.status);
    console.error("[smoke] Body:", health.text.slice(0, 500));
    process.exit(1);
  }

  const status = health.json && health.json.status;
  if (status !== "ok") {
    console.error("[smoke] FAIL /api/health payload status:", status);
    console.error("[smoke] Body:", health.text.slice(0, 500));
    process.exit(1);
  }

  console.info("[smoke] PASS /api/health");

  // 2) Tracker critical endpoint must be reachable (200 or auth-required)
  const snapUrl = `${baseUrl}/api/v1/analytics/snapshots`;
  const snapHeaders = { Origin: origin, Accept: "application/json" };
  if (token) snapHeaders.Authorization = `Bearer ${token}`;

  const snapshots = await callJson(snapUrl, {
    method: "GET",
    headers: snapHeaders,
  });

  const acceptable = new Set([200, 401, 403]);
  if (!acceptable.has(snapshots.response.status)) {
    console.error("[smoke] FAIL /api/v1/analytics/snapshots status:", snapshots.response.status);
    console.error("[smoke] Body:", snapshots.text.slice(0, 500));
    process.exit(1);
  }

  console.info("[smoke] PASS /api/v1/analytics/snapshots status:", snapshots.response.status);
  console.info("[smoke] Completed successfully.");
}

main().catch((err) => {
  console.error("[smoke] Unhandled error:", err && err.message ? err.message : err);
  process.exit(1);
});
