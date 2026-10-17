// ============================================================================
// HARDPAN GPS LIVE - THE LOGIC BEHIND gpsSearch / gpsCourse (2026-10-10)
//
// Phones never call GolfAPI. They call these two functions; the functions call
// GolfAPI with the key from Secret Manager, keep every answer in Firebase, and a
// course pulled once serves every phone after it for 0 calls.
//
// PURE: the database, fetch, the key, the clock and the push are handed in
// (index.js hands in the real ones; gps_live_test.js hands in fakes), so every
// guard below is tested without Firebase or GolfAPI.
//
// WHERE THINGS GO (all written here, with admin rights; the phone reads only
// gps_courses/<id>, gps_links/<key> and its own gps_usage/<uid>):
//   gps_courses/<courseId>        the stripped course (stripCourse) - forever
//   global_courses/gapi_<id>      its scorecard: pars, handicaps, tees (created once, never overwritten)
//   gps_links/<ourKey>            our course key -> courseId (first link wins - and only
//                                 the ORGANIZER of a live round on that course may make it;
//                                 only an owner may change or remove it: gpsUnlink)
//   gps_search/<query>            a search's results, 30 days
//   gps_meta/known/<id>           every course a search returned: may it be pulled?
//   gps_meta/left                 GolfAPI's apiRequestsLeft, after every call
//   gps_meta/day/<yyyymmdd>       pulls and uncached searches today, everyone
//   gps_meta/lock/<id>            one pull per course, however many phones tap
//   gps_usage/<uid>/<yyyymmdd>    this golfer's pulls / searches today
//   gps_log/<push>                every call: who, what, cost, calls left, result
//   gps_alerts/<kind>_<day>       "tell Manny" (plus a push and an ERROR log line)
// ============================================================================
'use strict';
const { stripCourse, leftOf } = require('./golfapi-strip.js');

const BASE = 'https://www.golfapi.io/api/v2.3';
// THE LIMITS ARE SETTINGS (2026-10-11): these defaults, overridden by the database
// node gps_meta/config (closed to phones; Manny edits it in the Firebase console's
// DATA view - no code, no deploy; read again within a minute), e.g.
//   gps_meta/config = { userPullsPerDay: 15, pullsPerDay: 50, floor: 50,
//                       userSearchesPerDay: 20, searchesPerDay: 200,
//                       userWindPerDay: 120, ownerUids: "uid1,uid2" }
// OWNERS (ALERT_UIDS, plus config.ownerUids) have NO per-golfer daily cap and are
// not stopped by the day's ceiling; the floor (calls left) still applies to everyone.
const LIMIT_MESSAGE = "You've hit your daily limit for new GPS courses. You can still play and score this round; GPS for new courses resets tomorrow.";
const DEFAULTS = {
    floor: 50,              // no GolfAPI call when fewer calls than this are left
    userPullsPerDay: 15,    // NEW courses per golfer per day (owners: no cap)
    pullsPerDay: 50,        // NEW courses per day, everyone - the ceiling
    userSearchesPerDay: 20, // uncached searches per golfer per day
    // THE SEARCH CEILING (audit H2, 2026-10-16): uncached searches per day, EVERYONE.
    // The per-golfer cap alone is no cap - a script can mint a fresh uid per search -
    // so the day's total stops too. Owners pass it (their searches still count).
    searchesPerDay: 200,
    // AN UNCACHED SEARCH NEEDS A REAL ACCOUNT (audit H2): anonymous uids are free to
    // mint, and each uncached search is a paid GolfAPI call. A cached answer still
    // serves anyone signed in, guests included. The app says "signin".
    searchNeedsAccount: true,
    searchDays: 30,         // a search's answer is kept this long
    pullNeedsAccount: true, // anonymous may search and open cached courses; a NEW pull needs Apple / Google / email
    lockMs: 120000,
};
const DAY_MS = 86400000;
// The Realtime Database hands holes "1".."18" back as an ARRAY ([0] empty): the
// phone always gets an object keyed by hole number.
function normalCourse(c) {
    if (!c || typeof c !== 'object' || !c.h) return c;
    const h = {};
    Object.keys(c.h).forEach((k) => { const x = c.h[k]; if (x && typeof x === 'object' && Number(k) >= 1) h[String(Number(k))] = x; });
    return Object.assign({}, c, { h });
}

// THE DAY IS ARIZONA'S (Manny, 2026-10-11): daily limits reset at midnight Phoenix
// time - UTC-7 all year (Arizona keeps no daylight saving) - not at 5 PM (UTC midnight).
const AZ_OFFSET_MS = 7 * 3600 * 1000;
function dayKey(ms) { return new Date(ms - AZ_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, ''); }
// The typed name, as a database key: "Prestwick  C.C." -> "prestwick_c_c".
function queryKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80); }
function cleanName(name) { return String(name || '').replace(/\s+/g, ' ').trim(); }
const ID_RE = /^\d{6,30}$/;
const KEY_RE = /^[A-Za-z0-9_-]{1,80}$/;
// A round code (code-issuer.js: six characters; older rounds may differ in length).
const CODE_RE = /^[A-Z0-9]{3,12}$/;

// The app's own naming: CLUB (COURSE) when they differ (course-import-rules.js).
function displayName(club, course) {
    club = String(club || '').trim(); course = String(course || '').trim();
    if (!club) return course;
    if (!course || course.toLowerCase() === club.toLowerCase()) return club;
    return club + ' (' + course + ')';
}
// THE SCORECARD from GolfAPI, in global_courses' shape - only when it would pass
// the database's own rule for a card (18 holes, par 3-6, handicaps 1-18 once
// each). Otherwise null, and the organizer types the card as today.
function cardRecord(s, at) {
    if (s.holes !== 18 || s.pars.length !== 18 || s.hcp.length !== 18) return null;
    if (!s.pars.every((p) => Number.isInteger(p) && p >= 3 && p <= 6)) return null;
    const seen = new Set(s.hcp);
    if (seen.size !== 18 || !s.hcp.every((h) => Number.isInteger(h) && h >= 1 && h <= 18)) return null;
    const data = s.pars.map((par, i) => ({ hole: i + 1, par, hcpIndex: s.hcp[i] }));
    // THE TEES IN THE SHAPE ROUND SETUP READS (the GolfCourseAPI import's):
    // { name, rating, slope, totalYards, parTotal, holes[] } under male / female.
    // Setup offers a tee only with a rating AND a slope (courseTeeChoices), so the
    // men's ratings make the male list and the women's (where GolfAPI rates a tee
    // for women) the female list, on the women's card when it is a valid one.
    const valid = (pars, hcp) => pars && hcp && pars.length === 18 && hcp.length === 18 && pars.every((p) => Number.isInteger(p) && p >= 3 && p <= 6)
        && new Set(hcp).size === 18 && hcp.every((h) => Number.isInteger(h) && h >= 1 && h <= 18);
    const wPars = valid(s.parsW, s.hcpW) ? s.parsW : s.pars, wHcp = valid(s.parsW, s.hcpW) ? s.hcpW : s.hcp;
    const tee = (t, pars, hcp, rating, slope) => Object.assign({
        name: t.name, totalYards: t.yards.reduce((a, b) => a + b, 0), parTotal: pars.reduce((a, b) => a + b, 0),
        holes: t.yards.map((y, i) => ({ par: pars[i], yardage: y, hcpIndex: hcp[i] })),
    }, rating && slope ? { rating, slope } : {});
    const played = s.tees.filter((t) => t.yards.some((y) => y > 0));
    const tees = played.map((t) => tee(t, s.pars, s.hcp, t.rm, t.sm));
    const women = played.filter((t) => t.rw && t.sw).map((t) => tee(t, wPars, wHcp, t.rw, t.sw));
    return {
        name: displayName(s.club, s.course).slice(0, 120), data,
        location: { city: s.city, state: s.state, country: 'USA', latitude: s.lat, longitude: s.lng },
        tees: { male: tees, female: women },
        source: { provider: 'golfapi', providerCourseId: s.id, providerClubName: s.club, importedAt: at },
    };
}

// Only sane numbers / booleans from the database: a typo can never lift the floor to 0
// or the caps to a million.
const LIMITS = { floor: [10, 500], userPullsPerDay: [0, 200], pullsPerDay: [0, 1000], userSearchesPerDay: [0, 500], searchesPerDay: [0, 5000], searchDays: [1, 365],
    userWindPerDay: [0, 2000] };   // gpsWind's per-golfer cap (weather-core.js reads the same node)
function cleanConfig(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(LIMITS).forEach((k) => { const v = Number(raw[k]); if (raw[k] != null && Number.isFinite(v) && v >= LIMITS[k][0] && v <= LIMITS[k][1]) out[k] = Math.floor(v); });
    if (typeof raw.pullNeedsAccount === 'boolean') out.pullNeedsAccount = raw.pullNeedsAccount;
    if (typeof raw.searchNeedsAccount === 'boolean') out.searchNeedsAccount = raw.searchNeedsAccount;
    const owners = Array.isArray(raw.ownerUids) ? raw.ownerUids : String(raw.ownerUids || '').split(',');
    out.ownerUids = owners.map((x) => String(x).trim()).filter((x) => /^[A-Za-z0-9_-]{6,128}$/.test(x));
    return out;
}
function createCore(deps) {
    const cfg = Object.assign({}, DEFAULTS, deps.cfg || {});
    const db = deps.db, now = deps.now || Date.now;
    // The live settings: the defaults, then gps_meta/config (60 s cache).
    let cfgCache = null, cfgAt = 0;
    async function settings() {
        if (cfgCache && now() - cfgAt < 60000) return cfgCache;
        let raw = null;
        try { raw = await db.get('gps_meta/config'); } catch (e) { raw = null; }
        const c = cleanConfig(raw);
        const owners = new Set([].concat(c.ownerUids || [], (deps.owners ? deps.owners() : []) || []));
        delete c.ownerUids;
        cfgCache = Object.assign({}, cfg, c, { owners });
        cfgAt = now();
        return cfgCache;
    }

    async function log(entry) {
        try { await db.push('gps_log', Object.assign({ at: now() }, entry)); } catch (e) { /* the log never breaks a pull */ }
    }
    async function alert(kind, detail) {
        const id = kind + '_' + dayKey(now());
        const first = await db.transaction('gps_alerts/' + id, (cur) => (cur ? undefined : Object.assign({ at: now(), kind }, detail)));
        console.error('GOLFAPI_' + kind.toUpperCase(), JSON.stringify(detail));
        if (first.committed && deps.notify) { try { await deps.notify(kind, detail); } catch (e) { /* best effort */ } }
    }
    async function left() { const v = await db.get('gps_meta/left'); return leftOf(v); }
    // ONE GolfAPI call. The endpoint (never the key) and what is left are recorded.
    async function call(endpoint, cost, who) {
        const res = await deps.fetch(BASE + endpoint, { headers: { Authorization: 'Bearer ' + deps.key(), Accept: 'application/json' } });
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        const l = body ? leftOf(body.apiRequestsLeft) : null;
        if (l != null) await db.set('gps_meta/left', l);
        await log({ uid: who.uid, act: 'call', endpoint: endpoint.replace(/\?.*$/, ''), cost, status: res.status, left: l });
        const fl = (cfgCache && cfgCache.floor) || cfg.floor;
        if (l != null && l < fl) await alert('floor', { left: l, floor: fl });
        if (!res.ok || !body) throw new Error('GolfAPI ' + res.status);
        return body;
    }
    // A daily counter that may not pass max. true: counted.
    async function count(path, max) {
        const r = await db.transaction(path, (cur) => ((Number(cur) || 0) >= max ? undefined : (Number(cur) || 0) + 1));
        return r.committed;
    }
    async function uncount(path) { await db.transaction(path, (cur) => Math.max(0, (Number(cur) || 0) - 1)); }

    function need(auth) {
        if (!auth || !auth.uid) { const e = new Error('Sign in first.'); e.code = 'unauthenticated'; throw e; }
        return { uid: String(auth.uid), anonymous: !!(auth.token && auth.token.firebase && auth.token.firebase.sign_in_provider === 'anonymous') };
    }
    function bad(msg) { const e = new Error(msg); e.code = 'invalid-argument'; return e; }

    // ---- SEARCH (on a tap; 0.1 call, or 0 when someone searched it lately) ----
    async function search(auth, input) {
        const who = need(auth);
        const name = cleanName(input && input.name);
        if (name.length < 3 || name.length > 60) throw bad('Type 3 to 60 letters of the course name.');
        const q = queryKey(name);
        if (!q) throw bad('Type the course name.');
        const t = now(), day = dayKey(t), c = await settings();
        let hit = await db.get('gps_search/' + q);
        let results = hit && hit.at > t - c.searchDays * DAY_MS ? hit.results || [] : null;
        let cost = 0;
        if (!results) {
            const owner = c.owners.has(who.uid);
            // A GUEST GETS CACHED ANSWERS ONLY: this one would call GolfAPI, so it needs
            // Apple / Google / email (the app shows MESSAGES.signin). Before the floor and
            // the counters, so a refused guest spends nothing and counts nothing.
            if (c.searchNeedsAccount && who.anonymous && !owner) { await log({ uid: who.uid, act: 'search', q, result: 'signin' }); return { status: 'signin', results: [] }; }
            const l = await left();
            if (l != null && l - 0.1 < c.floor) { await alert('floor', { left: l, floor: c.floor }); await log({ uid: who.uid, act: 'search', q, result: 'floor' }); return { status: 'soon', results: [] }; }
            const mine = `gps_usage/${who.uid}/${day}/searches`, all = `gps_meta/day/${day}/searches`;
            if (!owner && !(await count(mine, c.userSearchesPerDay))) { await log({ uid: who.uid, act: 'search', q, result: 'limit' }); return { status: 'limit', results: [], message: LIMIT_MESSAGE }; }
            // THE DAY'S SEARCH CEILING, everyone (owners exempt, but counted - as pulls are).
            // The golfer's own count is given back: the ceiling, not they, said no.
            if (owner) await db.transaction(all, (cur) => (Number(cur) || 0) + 1);
            else if (!(await count(all, c.searchesPerDay))) {
                await uncount(mine);
                await alert('searchcap', { day, max: c.searchesPerDay });
                await log({ uid: who.uid, act: 'search', q, result: 'searchcap' });
                return { status: 'searchcap', results: [] };
            }
            const body = await call('/clubs?' + new URLSearchParams({ name, country: 'usa' }).toString(), 0.1, who);
            cost = 0.1;
            results = [];
            (body.clubs || []).forEach((c) => (c.courses || []).forEach((k) => {
                const id = String(k.courseID || '');
                if (!ID_RE.test(id) || results.length >= 60) return;
                results.push({ id, club: String(c.clubName || ''), course: String(k.courseName || ''), city: String(c.city || ''), state: String(c.state || ''),
                    holes: Number(k.numHoles) || 0, gps: Number(k.hasGPS) === 1 && Number(k.numCoordinates) > 0 });
            }));
            await db.set('gps_search/' + q, { at: t, name, results });
            const known = {};
            results.forEach((r) => { known[r.id] = { gps: r.gps, holes: r.holes, name: displayName(r.club, r.course), at: t }; });
            if (results.length) await db.update('gps_meta/known', known);
        }
        // Which are already in Firebase (open at once, 0 calls).
        const have = await Promise.all(results.map((r) => db.get('gps_courses/' + r.id + '/id')));
        const out = results.map((r, i) => Object.assign({}, r, { name: displayName(r.club, r.course), cached: !!have[i] }));
        await log({ uid: who.uid, act: 'search', q, cost, n: out.length, result: cost ? 'called' : 'cache' });
        return { status: 'ok', results: out };
    }

    // ---- ONE COURSE (2 calls the first time, ever; 0 after) ----
    async function course(auth, input) {
        const who = need(auth);
        const id = String((input && input.courseId) || '');
        if (!ID_RE.test(id)) throw bad('No such course.');
        const ourKey = input && input.ourKey != null ? String(input.ourKey) : null;
        if (ourKey != null && !KEY_RE.test(ourKey)) throw bad('No such course key.');
        const roundCode = input && input.roundCode != null ? String(input.roundCode).toUpperCase() : null;
        if (roundCode != null && !CODE_RE.test(roundCode)) throw bad('No such round.');
        const t = now(), day = dayKey(t), c = await settings();
        const owner = c.owners.has(who.uid);
        // WHO MAY LINK (audit H3, 2026-10-16). gps_links/<key> tells EVERY later golfer
        // which GolfAPI course one of our courses is, so a wrong link is wrong GPS for
        // everyone. It used to be anyone, guests included, first link forever. Now:
        //   - an OWNER (ALERT_UIDS / config.ownerUids) may link, and may replace a link;
        //   - anyone else only as the ORGANIZER of a live round ON THAT COURSE: the round
        //     code comes along, events/<code> must exist (a deleted round is gone), carry
        //     ownerUid === this uid and activeCourseKey === this key, and not have been
        //     replaced (supersededBy). A round carries no timestamp to test "recent" on;
        //     the round existing, being theirs and being on this course is the test;
        //   - and even then never over an existing link (the first link wins).
        // A refused link refuses nothing else: the course still comes back.
        const organizes = async () => {
            if (!roundCode) return false;
            const ev = await db.get('events/' + roundCode);
            return !!(ev && typeof ev === 'object' && ev.ownerUid && String(ev.ownerUid) === who.uid
                && String(ev.activeCourseKey || '') === ourKey && !ev.supersededBy);
        };
        const link = async () => {
            if (!ourKey || ourKey === 'gapi_' + id) return;
            if (!(await db.get('global_courses/' + ourKey + '/name'))) return;   // only a real course of ours
            const was = await db.get('gps_links/' + ourKey);
            if (was === id) return;
            if (owner) {
                await db.set('gps_links/' + ourKey, id);
                await log({ uid: who.uid, act: 'link', key: ourKey, id, was: was || null, result: was ? 'relinked' : 'linked' });
                return;
            }
            if (was || !(await organizes())) { await log({ uid: who.uid, act: 'link', key: ourKey, id, result: was ? 'kept' : 'refused' }); return; }
            await db.transaction('gps_links/' + ourKey, (cur) => (cur ? undefined : id));   // the first link wins
        };
        const cached = await db.get('gps_courses/' + id);
        if (cached) {
            await link();
            await log({ uid: who.uid, act: 'course', id, cost: 0, result: 'cache' });
            return { status: 'ready', course: normalCourse(cached), cardKey: (await db.get('global_courses/gapi_' + id + '/name')) ? 'gapi_' + id : null };
        }
        const known = await db.get('gps_meta/known/' + id);
        const done = async (result, extra) => { await log({ uid: who.uid, act: 'course', id, cost: 0, result }); return Object.assign({ status: result }, extra || {}); };
        if (!known) return done('unknown');                     // search for it first - no blind pulls
        if (!known.gps) return done('nogps');                   // GolfAPI has no GPS for it
        if (c.pullNeedsAccount && who.anonymous) return done('account');
        const l = await left();
        if (l != null && l - 2 < c.floor) { await alert('floor', { left: l, floor: c.floor }); return done('soon'); }
        const mine = `gps_usage/${who.uid}/${day}/pulls`, all = `gps_meta/day/${day}/pulls`;
        // Every pull is still COUNTED for the owner (the log and usage stay honest); the cap is just not applied.
        if (owner) await db.transaction(mine, (cur) => (Number(cur) || 0) + 1);
        else if (!(await count(mine, c.userPullsPerDay))) {
            await alert('userlimit_' + who.uid, { uid: who.uid, day, max: c.userPullsPerDay });
            return done('limit', { max: c.userPullsPerDay, message: LIMIT_MESSAGE });
        }
        // The day's ceiling: owners are exempt too (their pulls still count toward it for everyone else).
        if (owner) await db.transaction(all, (cur) => (Number(cur) || 0) + 1);
        else if (!(await count(all, c.pullsPerDay))) { await uncount(mine); await alert('daycap', { day, max: c.pullsPerDay }); return done('soon'); }
        const lock = await db.transaction('gps_meta/lock/' + id, (cur) => (cur && cur.at > t - c.lockMs ? undefined : { at: t, uid: who.uid }));
        if (!lock.committed) { await uncount(mine); await uncount(all); return done('busy'); }
        try {
            // AN INTERRUPTED PULL IS NOT PAID FOR TWICE: the /courses answer is kept
            // (gps_meta/partial) until the pull completes, so a retry asks only for
            // what is missing.
            let cb = await db.get('gps_meta/partial/' + id + '/course'), spent = 1;
            if (!cb) { cb = await call('/courses/' + id, 1, who); spent = 2; await db.set('gps_meta/partial/' + id, { course: cb, at: t }); }
            const kb = await call('/coordinates/' + id, 1, who);
            const s = stripCourse(cb.course || cb, Object.assign({}, kb, { __fetched: new Date(t).toISOString() }));
            s.id = id;
            const greens = Object.keys(s.h).filter((n) => s.h[n].g && s.h[n].g.c).length;
            if (!greens) { await db.update('gps_meta/known/' + id, { gps: false }); await db.set('gps_meta/partial/' + id, null); await uncount(mine); return done('nogps'); }
            await db.set('gps_courses/' + id, s);
            // The raw /courses answer, kept server-side (gps_meta is closed to phones):
            // a later card fix rebuilds from it with no GolfAPI call.
            await db.set('gps_meta/raw/' + id, { course: cb, at: t });
            await db.set('gps_meta/partial/' + id, null);
            const card = cardRecord(s, t);
            let cardKey = null;
            if (card) {
                const w = await db.transaction('global_courses/gapi_' + id, (cur) => (cur ? undefined : card));
                cardKey = 'gapi_' + id;
                if (!w.committed) cardKey = (await db.get('global_courses/gapi_' + id + '/name')) ? cardKey : null;
            }
            await link();
            await log({ uid: who.uid, act: 'course', id, cost: spent, result: spent === 2 ? 'pulled' : 'pulled (resumed)', greens, card: !!card });
            return { status: 'ready', course: s, cardKey };
        } catch (e) {
            await uncount(mine); await uncount(all);
            await log({ uid: who.uid, act: 'course', id, result: 'error', error: String(e.message || e).slice(0, 200) });
            return { status: 'error' };
        } finally {
            await db.set('gps_meta/lock/' + id, null);
        }
    }

    // ---- UNLINK (owners only; audit H3) ----
    // The way back from a wrong link: removes gps_links/<key>, so the next organizer
    // of a round on that course can link it again. The course itself is kept.
    async function unlink(auth, input) {
        const who = need(auth);
        const ourKey = String((input && input.ourKey) || '');
        if (!KEY_RE.test(ourKey)) throw bad('No such course key.');
        const c = await settings();
        if (!c.owners.has(who.uid)) { await log({ uid: who.uid, act: 'unlink', key: ourKey, result: 'denied' }); return { status: 'denied' }; }
        const was = await db.get('gps_links/' + ourKey);
        await db.set('gps_links/' + ourKey, null);
        await log({ uid: who.uid, act: 'unlink', key: ourKey, was: was || null, result: 'ok' });
        return { status: 'ok', was: was || null };
    }
    return { search, course, unlink, settings, cfg };
}

module.exports = { createCore, cleanConfig, LIMIT_MESSAGE, normalCourse, cardRecord, displayName, queryKey, dayKey, DEFAULTS, ID_RE, KEY_RE };
