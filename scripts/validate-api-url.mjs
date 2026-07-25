const profile = process.env.EAS_BUILD_PROFILE || process.env.NODE_ENV || "development";
const rawUrl = process.env.EXPO_PUBLIC_API_URL;
const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
const placeholderPattern = /YOUR-BACKEND|example\.com|localhost(?::|\/|$)/i;
const isReleaseProfile = ["preview", "production"].includes(profile);

if (!url) {
  if (isReleaseProfile) {
    throw new Error(`EXPO_PUBLIC_API_URL is required for ${profile} builds.`);
  }
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  throw new Error(`EXPO_PUBLIC_API_URL is not a valid URL: ${url}`);
}

if (placeholderPattern.test(url)) {
  throw new Error(`EXPO_PUBLIC_API_URL contains a placeholder or localhost value: ${url}`);
}

if (isReleaseProfile && parsed.protocol !== "https:") {
  throw new Error(`EXPO_PUBLIC_API_URL must use https for ${profile} builds: ${url}`);
}

console.log(`API URL validated for ${profile}: ${parsed.origin}`);
