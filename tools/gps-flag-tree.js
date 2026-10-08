#!/usr/bin/env node
// ============================================================================
// A CONSUMER TREE, FOR RUNNING THE SUITE WITH GPS_ENABLED=0 (gps-v1)
//
//   node tools/gps-flag-tree.js <new-dir>
//   cd <new-dir> && npm test
//
// The repo root is the HardPan source (flag ON). This makes a git worktree of
// the CURRENT COMMIT at <new-dir> - a real one, with the full history, because
// several tests read old rules files with `git show <sha>:...` - and then turns
// it into what a Consumer build sees:
//
//   - every GPS_SHELL file is removed (git rm, so `git ls-files` agrees);
//   - every file a build ships (the three declared shells) and
//     sync-mobile-web.js go through tools/gps-flag.js with the flag OFF - the
//     transform build-shell.js and sync-mobile-web.js apply. Docs and tests
//     that merely QUOTE the markers are left as they are.
//
// Uncommitted changes are NOT included: commit first. node_modules is a symlink
// to this tree's. Remove it afterwards with: git worktree remove --force <dir>
//
// "Suite GREEN with flag ON and with flag OFF" means `npm test` here and
// `npm test` there. GPS-only tests skip there with the reason;
// gps_flag_test.js runs in both.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const flag = require('./gps-flag.js');

const ROOT = path.join(__dirname, '..');
const out = process.argv[2];
if (!out) { console.error('usage: node tools/gps-flag-tree.js <new-dir>'); process.exit(2); }
const OUT = path.resolve(out);
if (fs.existsSync(OUT)) { console.error(OUT + ' already exists'); process.exit(2); }

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
const dirty = git(ROOT, ['status', '--porcelain', '--untracked-files=no']).trim();
if (dirty) console.warn('WARNING: uncommitted changes are not in the Consumer tree:\n' + dirty);
git(ROOT, ['worktree', 'add', '--detach', OUT, 'HEAD']);

const sync = fs.readFileSync(path.join(OUT, 'sync-mobile-web.js'), 'utf8');
const list = (name) => [...(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(sync)[1]).matchAll(/'([^']+)'/g)].map((m) => m[1]);
const GPS_SHELL = list('GPS_SHELL');
const TRANSFORM = new Set(list('SHARED_SHELL').concat(list('CONSUMER_SHELL'), list('TOURNAMENT_SHELL'), ['sync-mobile-web.js']));

let rewritten = 0;
TRANSFORM.forEach((f) => {
    const p = path.join(OUT, f);
    if (GPS_SHELL.includes(f) || !fs.existsSync(p) || !flag.isText(f)) return;
    const text = fs.readFileSync(p, 'utf8');
    const off = flag.applyFlag(text, false, f);
    if (off !== text) { fs.writeFileSync(p, off); rewritten++; }
});
const gone = GPS_SHELL.filter((f) => fs.existsSync(path.join(OUT, f)));
if (gone.length) git(OUT, ['rm', '-q', '--'].concat(gone));
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(OUT, 'node_modules'));
console.log(`Consumer tree at ${OUT}: ${rewritten} files had GPS blocks removed, ${gone.length} GPS files removed.`);
console.log(`Now: cd ${OUT} && npm test`);
