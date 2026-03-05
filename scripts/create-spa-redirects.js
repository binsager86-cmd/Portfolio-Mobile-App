#!/usr/bin/env node
/**
 * create-spa-redirects.js
 *
 * Post-build script for SPA hosting on static platforms (DigitalOcean, GitHub Pages, etc.)
 *
 * Problem:  Static hosts return 404 for deep links like /login because no physical file exists.
 * Solution: Copy index.html to every known route path (e.g., dist/login/index.html).
 *           When the CDN finds the file it serves it, the SPA boots, and expo-router handles routing.
 *
 * This script:
 *   1. Reads dist/index.html
 *   2. Creates dist/404.html  (fallback for genuinely unknown paths)
 *   3. Creates dist/<route>/index.html for every app route
 *
 * Usage:  node scripts/create-spa-redirects.js
 */

const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist');
const INDEX = path.join(DIST, 'index.html');

// ── All app routes derived from app/(auth)/ and app/(tabs)/ ──────────────
const ROUTES = [
  // Auth routes
  'login',
  'register',
  // Auth routes with group prefix (expo-router may use either)
  '(auth)/login',
  '(auth)/register',
  // Tab routes
  'holdings',
  'transactions',
  'add-transaction',
  'add-stock',
  'add-deposit',
  'deposits',
  'dividends',
  'settings',
  'backup',
  'portfolio-tracker',
  'portfolio-analysis',
  'fundamental-analysis',
  'securities',
  'trading',
  'planner',
  'pfm',
  'integrity',
  'two',
  'modal',
  // Tab routes with group prefix
  '(tabs)',
  '(tabs)/holdings',
  '(tabs)/transactions',
  '(tabs)/add-transaction',
  '(tabs)/add-stock',
  '(tabs)/add-deposit',
  '(tabs)/deposits',
  '(tabs)/dividends',
  '(tabs)/settings',
  '(tabs)/backup',
  '(tabs)/portfolio-tracker',
  '(tabs)/portfolio-analysis',
  '(tabs)/fundamental-analysis',
  '(tabs)/securities',
  '(tabs)/trading',
  '(tabs)/planner',
  '(tabs)/pfm',
  '(tabs)/integrity',
  '(tabs)/two',
  '(tabs)/modal',
];

// ── Main ─────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(INDEX)) {
    console.error('❌  dist/index.html not found — run expo export first');
    process.exit(1);
  }

  const html = fs.readFileSync(INDEX, 'utf-8');

  // 1. Create 404.html (DO CDN serves this for truly unknown paths)
  const dest404 = path.join(DIST, '404.html');
  fs.writeFileSync(dest404, html);
  console.log('✅  dist/404.html');

  // 2. Create route-specific index.html copies
  let created = 0;
  for (const route of ROUTES) {
    const dir = path.join(DIST, route);
    const file = path.join(dir, 'index.html');

    // Skip if the route directory already has an index.html from the build
    if (fs.existsSync(file)) {
      console.log(`⏭   ${route}/index.html (already exists)`);
      continue;
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, html);
    created++;
    console.log(`✅  ${route}/index.html`);
  }

  console.log(`\n🎯  Created ${created} route files + 404.html — SPA deep links will work on any static host.`);
}

main();
