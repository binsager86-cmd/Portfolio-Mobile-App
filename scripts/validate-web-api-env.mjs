#!/usr/bin/env node

/*
 * Validates web API env configuration before production web builds.
 *
 * Goals:
 * - Prevent loopback/emulator API URLs from shipping to production web.
 * - Encourage explicit EXPO_PUBLIC_API_URL_WEB usage.
 */

function isLoopbackOrEmulator(value) {
  if (!value) return false;
  const lower = String(value).toLowerCase();
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "10.0.2.2";
  } catch {
    return (
      lower.includes("localhost") ||
      lower.includes("127.0.0.1") ||
      lower.includes("::1") ||
      lower.includes("10.0.2.2")
    );
  }
}

function norm(value) {
  if (value == null) return "";
  return String(value).trim();
}

const webUrl = norm(process.env.EXPO_PUBLIC_API_URL_WEB);
const globalUrl = norm(process.env.EXPO_PUBLIC_API_URL);
const allowLoopback = norm(process.env.ALLOW_LOOPBACK_WEB_API) === "1";

if (!webUrl && globalUrl) {
  console.warn("[env-check] EXPO_PUBLIC_API_URL_WEB is not set. Web will fall back to EXPO_PUBLIC_API_URL.");
}

if (webUrl && globalUrl && webUrl !== globalUrl) {
  console.info("[env-check] Both web and global API URLs are set. Web will use EXPO_PUBLIC_API_URL_WEB.");
}

const effectiveWebUrl = webUrl || globalUrl;

if (!effectiveWebUrl) {
  console.info("[env-check] No explicit web API URL set. Production web will use relative API paths.");
  process.exit(0);
}

if (!allowLoopback && isLoopbackOrEmulator(effectiveWebUrl)) {
  console.error("[env-check] Unsafe web API URL detected:", effectiveWebUrl);
  console.error("[env-check] Refusing build because loopback/emulator URLs break production users.");
  console.error("[env-check] Set EXPO_PUBLIC_API_URL_WEB to your real backend, or set ALLOW_LOOPBACK_WEB_API=1 for local-only testing.");
  process.exit(1);
}

console.info("[env-check] Web API env validation passed.");
