// ============================================================================
// GPS LIVE RULES, AS PROPOSED - NOT PUBLISHED (gps-live, 2026-10-10)
//
// docs/gps-live-rules-proposal.json: three NEW top-level nodes, nothing existing
// changes. This file adds them to an IN-MEMORY copy of database.rules.json (the
// repo file is not touched, nothing is published) and runs targaryen:
//   - a signed-in phone (anonymous counts) reads ONE course / ONE link;
//   - nobody lists them (no "dump every course" read - GolfAPI's terms);
//   - a phone reads only its own usage;
//   - no phone writes any of it (the Cloud Functions write with admin rights);
//   - gps_search / gps_log / gps_alerts / gps_meta stay closed by the existing $other;
//   - every existing node is byte-for-byte the same rule.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const targaryen = require('targaryen');

const REPO_RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8'));
const PROPOSAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs', 'gps-live-rules-proposal.json'), 'utf8'));
const NEW = ['gps_courses', 'gps_links', 'gps_usage'];
function proposedRules() {
    const r = JSON.parse(JSON.stringify(REPO_RULES));
    NEW.forEach((k) => { r.rules[k] = PROPOSAL[k]; });
    return r;
}
const PW = '012141521086298986065';
const DATA = {
    gps_courses: { [PW]: { id: PW, club: 'Prestwick Golf Course', h: { 1: { g: { c: [33.64, -78.96] } } } } },
    gps_links: { gca_123: PW },
    gps_usage: { uA: { 20261011: { pulls: 2 } }, uB: { 20261011: { pulls: 5 } } },
    gps_search: { prestwick: { at: 1, results: [] } },
    gps_log: { k1: { uid: 'uA' } },
    gps_alerts: { floor_20261011: { left: 49 } },
    gps_meta: { left: 400 },
    global_courses: { caledonia: { name: 'Caledonia', data: [] } },
};
const as = (uid, provider) => targaryen.database(proposedRules(), DATA).as(uid ? { uid, provider: provider || 'anonymous' } : null);
const read = (uid, p) => as(uid).read(p).allowed;
const write = (uid, p, v) => as(uid).write(p, v).allowed;

test('the proposal is NOT in database.rules.json, and it only ADDS: every existing rule is the same', () => {
    assert.ok(REPO_RULES.rules.events && REPO_RULES.rules.global_courses && REPO_RULES.rules.$other, 'positive: the real ruleset loaded');
    NEW.forEach((k) => assert.strictEqual(REPO_RULES.rules[k], undefined, k + ' is not live'));
    const p = proposedRules().rules;
    Object.keys(REPO_RULES.rules).forEach((k) => assert.deepStrictEqual(p[k], REPO_RULES.rules[k], k + ' unchanged'));
    assert.deepStrictEqual(Object.keys(p).filter((k) => !(k in REPO_RULES.rules)).sort(), NEW.slice().sort());
    // Today, with the live rules, a phone cannot read any of it.
    assert.strictEqual(targaryen.database(REPO_RULES, DATA).as({ uid: 'uA' }).read('/gps_courses/' + PW).allowed, false);
});

test('the diff on file is exactly the proposal, and only + lines', () => {
    const diff = fs.readFileSync(path.join(__dirname, 'docs', 'gps-live-rules.diff'), 'utf8');
    const minus = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    assert.deepStrictEqual(minus, [], 'nothing removed');
    NEW.forEach((k) => assert.ok(diff.includes('+    "' + k + '": {'), k));
});

test('a signed-in phone (anonymous too) reads ONE course and ONE link; signed out reads nothing', () => {
    assert.strictEqual(read('uA', '/gps_courses/' + PW), true);
    assert.strictEqual(as('uA', 'apple.com').read('/gps_courses/' + PW).allowed, true);
    assert.strictEqual(read('uA', '/gps_links/gca_123'), true);
    assert.strictEqual(read(null, '/gps_courses/' + PW), false, 'signed out');
    assert.strictEqual(read(null, '/gps_links/gca_123'), false);
});

test('no list read: nobody downloads every course or every link', () => {
    assert.strictEqual(read('uA', '/gps_courses'), false);
    assert.strictEqual(read('uA', '/gps_links'), false);
    assert.strictEqual(read('uA', '/'), false);
});

test('usage: your own only', () => {
    assert.strictEqual(read('uA', '/gps_usage/uA'), true);
    assert.strictEqual(read('uA', '/gps_usage/uB'), false);
    assert.strictEqual(read('uA', '/gps_usage'), false);
});

test('no phone writes any of it - courses, links, usage (no granting itself more pulls)', () => {
    assert.strictEqual(write('uA', '/gps_courses/' + PW, { id: PW }), false);
    assert.strictEqual(write('uA', '/gps_courses/999', { id: '999' }), false, 'not even a new one');
    assert.strictEqual(write('uA', '/gps_links/gca_123', '1'), false);
    assert.strictEqual(write('uA', '/gps_usage/uA/20261011/pulls', 0), false, 'its own counter either');
    assert.strictEqual(write('uA', '/gps_courses/' + PW, null), false, 'or delete');
});

test('search cache, log, alerts, meta: closed to every phone by the existing $other', () => {
    ['/gps_search/prestwick', '/gps_log', '/gps_alerts', '/gps_meta/left'].forEach((p) => {
        assert.strictEqual(read('uA', p), false, p + ' read');
        assert.strictEqual(write('uA', p, { x: 1 }), false, p + ' write');
    });
});
