// ============================================================================
// HOURLY HEALTH CHECK of hardpangolf.com (Manny, typed in the tournaments tab,
// 2026-11-17: "hourly health check (scanner score + course probe, homepage price
// band has no dashes, /tournaments 200, sw version) that writes a line to
// TEAM-LOG and flags the Advisor on failure").
//
// Five checks, read-only against the live site, one line per run:
//   sw        GET /sw.js            -> CACHE_VERSION present (its value is reported; a change since the last run is noted)
//   tourn     GET /tournaments      -> 200 after redirects, and the page is the Tournaments front page
//   price     GET /  + /site-pricing.js -> every data-price slot holds text that is not a dash, and the
//                                    <script src="/site-pricing.js?v=..."> tag's v equals the sha256 prefix of the
//                                    served file (the same rule hardpan_home_price_test.js holds the repo to)
//   scan      POST /api/scan-erase then POST /api/scorecard-scan (a stored synthetic card) -> status ok, 4 players
//   course    POST /api/scorecard-scan mode course (a stored real card front) -> status ok, tees read
//
// The line goes to TEAM-LOG.md as "<date> AZ | Tournaments-health | OK: ... | NEEDS MANNY: no" or
// "... | FAIL: ... | NEEDS MANNY: look at the health alert for Advisor", and a FAIL also writes
// outbox/HEALTH-ALERT-<stamp>.md with each check's detail. That file and the line are how the Advisor is flagged
// (the inbox protocol: lanes write TEAM-LOG + outbox, never another lane's inbox).
//
// SECRETS. The scan probe signs in as the test account: ~/.hardpan/health/probe.json holds { apiKey, refreshToken }
// (0600). They are read into memory, exchanged for an id token at securetoken.googleapis.com, sent only as the
// Bearer header, and never written to the line, the alert, the state file or stdout. The two probe bodies live
// beside it (score-body.json, course-body.json): photos of a synthetic card and a real card front, not the repo's.
//
// COST. Each run spends one erase and two model calls on the test account (its own free counts, reset by the erase),
// about 48 Gemini calls a day. The erase is the account's own (POST /api/scan-erase with its bearer).
//
// RUN BY HAND:  node tools/health-check.mjs            (writes the line)
//               node tools/health-check.mjs --dry      (prints the line, writes nothing)
// INSTALL hourly: tools/health/install.sh (copies this file to ~/.hardpan/health/, writes the LaunchAgent; --load starts it).
// TESTED by health_check_test.js with a stubbed fetch: every check's pass and fail, and that no secret reaches any output.
// ============================================================================
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';

export const SITE = 'https://hardpangolf.com';
export const HOME = path.join(os.homedir(), '.hardpan', 'health');
export const MAILBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared');
const DASH_ONLY = /^[\s–—‒-]*$/;   // '', '-', '–', '—'

export function stampAZ(d) {
    // America/Phoenix, no DST: UTC-7, always.
    const t = new Date(d.getTime() - 7 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

// ---- the checks ------------------------------------------------------------
export async function checkSw(fetch, site) {
    const r = await fetch(site + '/sw.js', { redirect: 'follow' });
    const t = r.ok ? await r.text() : '';
    const m = /const CACHE_VERSION = '([^']+)'/.exec(t);
    if (!r.ok) return { ok: false, detail: `sw.js HTTP ${r.status}` };
    if (!m) return { ok: false, detail: 'sw.js has no CACHE_VERSION' };
    return { ok: true, detail: `sw ${m[1]}`, version: m[1] };
}
export async function checkTournaments(fetch, site) {
    const r = await fetch(site + '/tournaments', { redirect: 'follow' });
    const t = r.ok ? await r.text() : '';
    if (r.status !== 200) return { ok: false, detail: `/tournaments HTTP ${r.status}` };
    if (!/HardPan Tournaments|tournament\.html|id="tournament/i.test(t) && !/<title>[^<]*Tournaments/i.test(t)) return { ok: false, detail: '/tournaments 200 but not the Tournaments page' };
    return { ok: true, detail: '/tournaments 200' };
}
export function priceSlots(html) {
    const out = [];
    const re = /data-price="([^"]+)"[^>]*>([^<]*)</g;
    let m;
    while ((m = re.exec(html))) out.push({ key: m[1], text: m[2] });
    return out;
}
export async function checkPrice(fetch, site) {
    const r = await fetch(site + '/', { redirect: 'follow' });
    if (!r.ok) return { ok: false, detail: `homepage HTTP ${r.status}` };
    const html = await r.text();
    const slots = priceSlots(html);
    if (!slots.length) return { ok: false, detail: 'homepage has no data-price slots' };
    const bad = slots.filter((s) => DASH_ONLY.test(s.text));
    const tag = /<script src="\/site-pricing\.js\?v=([0-9a-f]+)"/.exec(html);
    if (!tag) return { ok: false, detail: 'homepage has no versioned site-pricing.js tag' };
    const pr = await fetch(site + '/site-pricing.js', { redirect: 'follow' });
    if (!pr.ok) return { ok: false, detail: `site-pricing.js HTTP ${pr.status}` };
    const hash = createHash('sha256').update(await pr.text()).digest('hex');
    const parts = [];
    if (bad.length) parts.push(`${bad.length} slot(s) blank or a dash: ${bad.map((b) => b.key).join(', ')}`);
    if (!hash.startsWith(tag[1])) parts.push(`site-pricing.js tag v=${tag[1]} does not match the served file (${hash.slice(0, 8)})`);
    if (parts.length) return { ok: false, detail: parts.join('; ') };
    return { ok: true, detail: `price band ${slots.length} slots filled, site-pricing.js v${tag[1]} matches` };
}
export async function idToken(fetch, secrets) {
    const body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(secrets.refreshToken);
    const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(secrets.apiKey), {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
    });
    if (!r.ok) return { error: `token HTTP ${r.status}` };
    const j = await r.json();
    if (!j || !j.id_token) return { error: 'token response without id_token' };
    return { token: j.id_token };
}
export async function checkScan(fetch, site, token, bodies) {
    const post = async (p, body) => {
        const t0 = Date.now();
        const r = await fetch(site + p, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body });
        let j = null; try { j = await r.json(); } catch (e) { j = null; }
        return { status: r.status, j, s: (Date.now() - t0) / 1000 };
    };
    const e = await post('/api/scan-erase', '');
    if (!e.j || (e.j.status !== 'erased' && e.j.status !== 'ok')) return { score: { ok: false, detail: `scan-erase HTTP ${e.status} ${e.j && e.j.status || ''}`.trim() }, course: { ok: false, detail: 'not run (erase failed)' } };
    const s = await post('/api/scorecard-scan', bodies.score);
    const sj = s.j || {};
    const score = sj.status === 'ok' && sj.result && Array.isArray(sj.result.players) && sj.result.players.length === 4
        ? { ok: true, detail: `scan score ok ${s.s.toFixed(1)} s (${sj.model || '?'}${sj.retried ? ', Pro retry' : ', no retry'}${sj.focused ? ', focused' : ''}; hard ${(sj.validation && sj.validation.hard || []).length})` }
        : { ok: false, detail: ['scan score HTTP ' + s.status, 'status ' + (sj.status || '?'), sj.reason || '', 'players ' + (sj.result && sj.result.players ? sj.result.players.length : '-')].filter(Boolean).join(' ') };
    const c = await post('/api/scorecard-scan', bodies.course);
    const cj = c.j || {};
    const tees = cj.result && Array.isArray(cj.result.tees) ? cj.result.tees.length : 0;
    const course = cj.status === 'ok' && tees >= 1
        ? { ok: true, detail: `course ok ${c.s.toFixed(1)} s, ${tees} tees${cj.retried ? ', Pro retry' : ''}` }
        : { ok: false, detail: ['course HTTP ' + c.status, 'status ' + (cj.status || '?'), cj.reason || '', 'tees ' + tees].filter(Boolean).join(' ') };
    return { score, course };
}

// ---- the run ---------------------------------------------------------------
export async function runHealth(deps) {
    const fetch = deps.fetch, site = deps.site || SITE, now = deps.now || new Date();
    const checks = {};
    const safe = async (name, fn) => { try { checks[name] = await fn(); } catch (e) { checks[name] = { ok: false, detail: `${name}: ${e && e.name === 'TimeoutError' ? 'timeout' : (e && e.message || 'error').slice(0, 80)}` }; } };
    await safe('sw', () => checkSw(fetch, site));
    await safe('tourn', () => checkTournaments(fetch, site));
    await safe('price', () => checkPrice(fetch, site));
    if (!deps.secrets || !deps.bodies) {
        checks.score = { ok: false, detail: 'scan probe not set up (no probe.json / bodies)' };
        checks.course = { ok: false, detail: 'not run' };
    } else {
        await safe('scan', async () => {
            const t = await idToken(fetch, deps.secrets);
            if (t.error) { checks.score = { ok: false, detail: 'sign-in: ' + t.error }; checks.course = { ok: false, detail: 'not run' }; return { ok: true, detail: '' }; }
            const r = await checkScan(fetch, site, t.token, deps.bodies);
            checks.score = r.score; checks.course = r.course;
            return { ok: true, detail: '' };
        });
        if (checks.scan && !checks.scan.ok) { checks.score = checks.score || { ok: false, detail: checks.scan.detail }; checks.course = checks.course || { ok: false, detail: 'not run' }; }
        delete checks.scan;
    }
    // the sw version against the last run
    const prev = deps.state || {};
    let swNote = '';
    if (checks.sw.ok && prev.sw && prev.sw !== checks.sw.version) swNote = ` (was ${prev.sw})`;
    const order = ['sw', 'tourn', 'price', 'score', 'course'];
    const fails = order.filter((k) => !checks[k].ok);
    const ok = fails.length === 0;
    const stamp = stampAZ(now);
    const summary = order.map((k) => checks[k].detail + (k === 'sw' ? swNote : '')).filter(Boolean).join(' · ');
    const line = ok
        ? `${stamp} AZ | Tournaments-health | OK: ${summary} | NEEDS MANNY: no`
        : `${stamp} AZ | Tournaments-health | FAIL (${fails.join(', ')}): ${fails.map((k) => checks[k].detail).join('; ')} · rest: ${order.filter((k) => checks[k].ok).map((k) => checks[k].detail).join(' · ') || 'none'} | NEEDS MANNY: look at the health alert for Advisor`;
    const alert = ok ? null : [
        `# HEALTH ALERT - hardpangolf.com - ${stamp} AZ (tools/health-check.mjs, hourly)`,
        '',
        `Failed: ${fails.join(', ')}.`,
        '',
        ...order.map((k) => `- ${k}: ${checks[k].ok ? 'ok' : 'FAIL'} - ${checks[k].detail}`),
        '',
        `Previous run: ${prev.at ? prev.at + ' AZ, ' + (prev.ok ? 'OK' : 'FAIL') : 'none recorded'}. Consecutive failures: ${(prev.ok === false ? (prev.streak || 1) : 0) + 1}.`,
        '',
        'for Advisor'
    ].join('\n');
    const state = { at: stamp, ok, sw: checks.sw.version || prev.sw || null, streak: ok ? 0 : ((prev.ok === false ? (prev.streak || 1) : 0) + 1), fails };
    return { ok, line, alert, checks, state };
}

// ---- the CLI ---------------------------------------------------------------
async function main() {
    const dry = process.argv.includes('--dry');
    const home = process.env.HEALTH_HOME || HOME, mailbox = process.env.HEALTH_MAILBOX || MAILBOX;
    let secrets = null, bodies = null;
    try { secrets = JSON.parse(fs.readFileSync(path.join(home, 'probe.json'), 'utf8')); } catch (e) { secrets = null; }
    try { bodies = { score: fs.readFileSync(path.join(home, 'score-body.json'), 'utf8'), course: fs.readFileSync(path.join(home, 'course-body.json'), 'utf8') }; } catch (e) { bodies = null; }
    let state = {}; try { state = JSON.parse(fs.readFileSync(path.join(home, 'state.json'), 'utf8')); } catch (e) { state = {}; }
    const f = (url, init) => globalThis.fetch(url, Object.assign({ signal: AbortSignal.timeout(60000) }, init || {}));
    const out = await runHealth({ fetch: f, secrets, bodies, state });
    secrets = null;
    console.log(out.line);
    if (dry) return;
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify(out.state));
    fs.appendFileSync(path.join(mailbox, 'TEAM-LOG.md'), out.line + '\n');
    if (out.alert) {
        fs.mkdirSync(path.join(mailbox, 'outbox'), { recursive: true });
        fs.writeFileSync(path.join(mailbox, 'outbox', 'HEALTH-ALERT-' + out.state.at.replace(/[^0-9]/g, '').slice(0, 12) + '.md'), out.alert + '\n');
    }
    process.exitCode = out.ok ? 0 : 1;
}
if (process.argv[1] && /health-check\.mjs$/.test(process.argv[1])) main().catch((e) => { console.error('health-check: ' + (e && e.message || e)); process.exitCode = 2; });
