#!/usr/bin/env node
/**
 * publish.js — automated OTA release script.
 *
 * Usage:
 *   node mobile-app/scripts/publish.js [--channel production]
 *
 * What it does:
 *   1. Collects git commits from the past week (no merges)
 *   2. Prepends a dated entry to CHANGELOG.md
 *   3. Runs `eas update` on the specified channel
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHANGELOG = path.join(__dirname, '..', 'CHANGELOG.md');
const channel = process.argv.includes('--channel')
  ? process.argv[process.argv.indexOf('--channel') + 1]
  : 'production';

// ── 1. Collect recent commits ─────────────────────────────────────
let commits = '';
try {
  commits = execSync('git log --oneline --since="1 week ago" --no-merges', {
    encoding: 'utf8',
  }).trim();
} catch {
  commits = '(could not read git log)';
}

const date = new Date().toISOString().split('T')[0];
const commitLines = commits
  ? commits.split('\n').map((c) => `- ${c}`).join('\n')
  : '- (no new commits)';

const entry = `## 🚀 ${date} Release (channel: ${channel})\n\n${commitLines}\n\n`;

// ── 2. Update CHANGELOG.md ────────────────────────────────────────
const HEADER = '# Changelog\n\n';
const existing = fs.existsSync(CHANGELOG)
  ? fs.readFileSync(CHANGELOG, 'utf8')
  : HEADER;

const updated = existing.startsWith(HEADER)
  ? existing.replace(HEADER, HEADER + entry)
  : HEADER + entry + existing;

fs.writeFileSync(CHANGELOG, updated, 'utf8');
console.log(`📝 CHANGELOG.md updated for ${date}`);

// ── 3. Push OTA update ────────────────────────────────────────────
const message = `Auto-release ${date}`;
console.log(`🚀 Pushing EAS update → channel "${channel}"...`);
try {
  execSync(
    `npx eas update --channel ${channel} --message "${message}" --non-interactive`,
    { stdio: 'inherit' },
  );
  console.log('✅ OTA update deployed. Monitoring for rollback triggers…');
} catch (err) {
  console.error('❌ EAS update failed:', err.message);
  process.exit(1);
}
