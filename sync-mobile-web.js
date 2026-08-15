#!/usr/bin/env node
// Regenerates www/app/ (the Capacitor webDir subtree) from the canonical production files
// at the repo root. This is the ONLY sanctioned way www/app/ should ever be updated.
//
// Do NOT hand-edit files inside www/ - they are a generated copy, not a second source of
// truth. Editing them directly will silently diverge from the real (web-deployed) app and
// the next sync will overwrite your changes anyway.
//
// Run this any time production HTML/JS files change, before `npx cap sync`.
//
// Usage: node scripts/sync-mobile-web.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEST = path.join(ROOT, 'www', 'app');

// Exactly the production runtime files the app needs - no tests, no fallback/archive
// copies, no dev tooling, no Firebase CLI config, no Node package files. Fallback copies
// and the two legacy unauthenticated admin panels are deliberately excluded from the
// packaged app bundle even though they still exist in the web repo for now.
const FILES_TO_SYNC = [
    'admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
    'tournament.html', 'tournament-scorecard.html', 'instructions.html', 'shared.html',
    'course-data.js', 'money-engine.js', 'tournament-engine.js', 'sw.js',
    'manifest.json', 'icon-192.png', 'icon-512.png',
];

fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
let missing = [];
FILES_TO_SYNC.forEach((file) => {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) { missing.push(file); return; }
    fs.copyFileSync(src, path.join(DEST, file));
    copied++;
});

console.log(`Synced ${copied}/${FILES_TO_SYNC.length} files into www/app/`);
if (missing.length > 0) {
    console.error('MISSING (not found at repo root, not copied):', missing.join(', '));
    process.exit(1);
}
