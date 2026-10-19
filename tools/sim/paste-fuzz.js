#!/usr/bin/env node
// ============================================================================
// ROSTER PASTE FUZZER (URGENT-008 part 2, 2026-10-18)
//
// "Simulate pasting all different kinds of ways." A seeded generator builds
// roster pastes the way organizers actually write them - iMessage, Notes,
// Excel / Google Sheets, numbered lists, bullets, group headers, tee times,
// plus handicaps, flights before / after / beside the name - and KNOWS the
// answer for each one (name, handicap, flight, group sizes). The oracle runs
// parsePlayerPasteText (roster-paste.js) over it and scores every golfer line:
//
//   exact    - name, handicap and flight all read as meant
//   safe     - the documented safe reading of an ambiguous line ("Glenn A"
//              with no handicap stays a golfer called "Glenn A"), where the
//              format allows it
//   flagged  - read wrongly, BUT the preview names the line (flaggedLines,
//              flaggedFlights or checkLines) so the organizer fixes it before
//              saving - acceptable only where the format says so
//   fail     - read wrongly and silently (or a header became a golfer, or a
//              golfer vanished)
//
// Every format option is COMMON (a real organizer types or pastes it) or RARE.
// A paste is COMMON when every option in it is. Exit code 1 if ANY common paste
// fails. Pure: no network, no DOM, no db.
//
//   node tools/sim/paste-fuzz.js --count 2000 --seed 7
//   node tools/sim/paste-fuzz.js --seed 7 --count 1 --show        (print a paste)
//   node tools/sim/paste-fuzz.js --parser /tmp/old-roster-paste.js (another build)
//   node tools/sim/paste-fuzz.js --setup   (also run trip-setup-paste.js over it)
//   --fails N   print up to N failing examples per family (default 3)
// ============================================================================
'use strict';
const path = require('path');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const COUNT = parseInt(arg('count', '1000'), 10);
const SEED = parseInt(arg('seed', '1'), 10);
const SHOW = !!arg('show', false);
const SETUP = !!arg('setup', false);
const MAXFAILS = parseInt(arg('fails', '3'), 10);
const ROOT = path.join(__dirname, '..', '..');
const PARSER = path.resolve(String(arg('parser', path.join(ROOT, 'roster-paste.js'))));

// The page loads my-groups.js (the note stripper) before roster-paste.js; the
// module form requires it itself from its own folder - give an alternate build
// the same thing.
global.stripTrailingNote = require(path.join(ROOT, 'my-groups.js')).stripTrailingNote;
const R = require(PARSER);

// ---- seeded PRNG (mulberry32) ----------------------------------------------
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
let rand = rng(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
// weighted pick over [[value, weight], ...]
const wpick = (pairs) => { const tot = pairs.reduce((s, p) => s + p[1], 0); let x = rand() * tot; for (const p of pairs) { x -= p[1]; if (x < 0) return p[0]; } return pairs[pairs.length - 1][0]; };

// ---- THE FORMAT OPTIONS, each COMMON or RARE ---------------------------------
// The class is the claim "a real organizer types or pastes this". AMBIG ones are
// common enough to matter but cannot be read with certainty: they must come out
// exact OR flagged, never silently wrong.
const CLASS = {
    // order of name / handicap / flight on a line
    'order:name_hcp': 'COMMON',          // Marty 9
    'order:lead_flight': 'COMMON',       // A Marty 9
    'order:trail_flight': 'COMMON',      // Marty 9 A   (URGENT-004)
    'order:name_flight_hcp': 'COMMON',   // Marty A 9   AMBIGUOUS with "Matt B 12" (a last initial): safe reading + flag
    'order:hcp_name': 'RARE',            // 9 Marty A   (a leading number is also how lists are numbered)
    'order:trail_flight_nohcp': 'COMMON',// Glenn A     AMBIGUOUS: the safe reading is a golfer called "Glenn A"
    // separator between name and handicap
    'sep:sp1': 'COMMON', 'sep:spN': 'COMMON', 'sep:tab': 'COMMON', 'sep:comma': 'COMMON',
    'sep:dash': 'COMMON', 'sep:colon': 'COMMON', 'sep:pipe': 'RARE', 'sep:slash': 'RARE',
    // handicap styles
    'hcp:int': 'COMMON', 'hcp:dec0': 'COMMON', 'hcp:dec1': 'COMMON', 'hcp:plus': 'COMMON', 'hcp:plusdec': 'COMMON',
    'hcp:paren': 'COMMON', 'hcp:word_before': 'COMMON', 'hcp:word_after': 'COMMON', 'hcp:none': 'COMMON',
    'hcp:some_missing': 'COMMON',
    // flight styles
    'flight:upper': 'COMMON', 'flight:lower': 'COMMON', 'flight:none': 'COMMON',
    'flight:word_after': 'RARE',  // 12 A flight
    'flight:word_before': 'RARE', // 12 Flight A
    'flight:paren': 'RARE',       // 12 (A)
    'flight:some_unlettered': 'COMMON',
    // names
    'name:plain': 'COMMON', 'name:two_word': 'COMMON', 'name:three_word': 'COMMON', 'name:last_initial': 'COMMON',
    'name:apostrophe': 'COMMON', 'name:hyphen': 'COMMON', 'name:accented': 'COMMON', 'name:caps': 'COMMON',
    'name:initials': 'COMMON', 'name:nickname_quotes': 'COMMON', 'name:emoji': 'RARE', 'name:trailing_emoji': 'RARE',
    'name:last_first': 'RARE',    // Orozco, Manny 12
    'name:dup': 'COMMON',
    // group breaks
    'break:none': 'COMMON', 'break:blank': 'COMMON', 'break:multi_blank': 'COMMON', 'break:ws_blank': 'COMMON',
    'break:group_header': 'COMMON', 'break:number_header': 'COMMON', 'break:teetime_header': 'COMMON',
    'break:flight_header': 'RARE', // "A Flight" / "Flight B" over the golfers in it
    // numbered lines and bullets
    'num:none': 'COMMON', 'num:paren': 'COMMON', 'num:dot': 'COMMON', 'num:dash': 'RARE', 'num:hash': 'RARE',
    'bullet:none': 'COMMON', 'bullet:dot': 'COMMON', 'bullet:dash': 'COMMON', 'bullet:star': 'COMMON', 'bullet:dot_tab': 'COMMON',
    // where it came from
    'src:plain': 'COMMON', 'src:imessage': 'COMMON', 'src:notes': 'COMMON', 'src:excel': 'COMMON', 'src:sheets': 'COMMON',
    'ws:crlf': 'COMMON', 'ws:cr_only': 'RARE', 'ws:nbsp': 'COMMON', 'ws:trailing': 'COMMON', 'ws:smart_quotes': 'COMMON',
    'ws:zero_width': 'RARE',
    // MESSY PASTES: one list, written by hand, is not uniform
    'mess:mixed_sep': 'COMMON',  // "Marty 9" then "Scott - 7" then "Lance: 14"
    'mess:lowercase': 'COMMON',  // "marty 9"
    'mess:note': 'COMMON',       // "Jimmy 11 (captain)", "Skeens 2.0/A (guest)"
    'mess:mixed_order': 'COMMON',// "A Marty 9" and "Scott 7 B" in one list
    'name:jr_dot': 'COMMON',     // "Mike Jr. 12" -> "Mike Jr" (v194: a trailing dot comes off)
    'hcp:placeholder': 'RARE',   // "Glenn -", "Glenn ?", "Glenn N/A": no handicap yet
    'hcp:two_dec': 'RARE',       // "Glenn 12.45" (not a handicap shape): must be flagged
    'hcp:comma_dec': 'RARE',     // "Glenn 12,4" (European decimal): must be flagged
    'tee:named': 'COMMON',       // "Zack Carrano 6 blue" with the round's tees passed in
    'multi:per_line': 'RARE',    // "Manny 8, Jimmy 11" - two golfers on one line: must be flagged
    'xl:header_row': 'COMMON', 'xl:first_last_cols': 'COMMON', 'xl:index_col': 'RARE', 'xl:empty_hcp_with_flight': 'COMMON',
};

// ---- names -------------------------------------------------------------------
const POOL = {
    plain: ['Skeens', 'Manny', 'Glenn', 'Marty', 'Lance', 'Paul', 'Jimmy', 'Randy', 'Tanner', 'Zack', 'Anthony', 'Danny', 'Chris', 'Scott', 'Rocco', 'Marcus', 'Jeremy', 'Teddy', 'Reese', 'Hugh', 'Liam', 'Eoin', 'Noel', 'Shay', 'Colm', 'Dara', 'Ray', 'Ed', 'Al', 'Bo'],
    two_word: ['Big Jim', 'Mike Jr', 'Zack Carrano', 'Tommy Chen', 'Little Mike', 'Pat Morrissey', 'Tom Kelly', 'Sean Burke', 'Big Al', 'Old Tom'],
    three_word: ['Derrick J Doncaster', 'Mary Ann Smith', 'Juan Carlos Ruiz', 'Billy Bob Thornton'],
    // a last initial: the dangerous one is A or B (looks like a flight)
    last_initial: ['Matt B', 'Jim B', 'Randy T', 'Mike S', 'Ryan A', 'Chris H', 'Matt H', 'Joe A', 'Dave B', 'Tim K'],
    apostrophe: ["O'Neil", "D'Angelo", "Pat O'Brien", "Shaq O'Neal"],
    hyphen: ['Smith-Jones', 'Jean-Luc', 'Mary-Kate Ross', 'Al Jones-Hart'],
    accented: ['José', 'Zoë', 'Ñico', 'Renée', 'Müller', 'Martín García', 'Björn'],
    caps: ['SKEENS', 'BIG JIM', 'MATT B', 'GLENN', 'TOMMY CHEN'],
    initials: ['B.J. Smith', 'A.J. Cole', 'J.R. Ewing', 'T.J.'],
    jr_dot: ['Mike Jr.', 'Bob Sr.', 'Dr. Smith', 'St. James'],      // "T.J." loses its trailing dot (v194) - see expectName
    nickname_quotes: ['Jim "Doc" Smith', 'Bobby "The Hammer" Lee'],
    emoji: ['Jimmy 🏌\uFE0F', '⛳ Paul', 'Marty 🔥', '🦅 Eagle Eddie'],
    last_first: ['Orozco, Manny', 'Smith, John', 'Kelly, Tom'],
};
function expectName(n) {
    // v194: a trailing period comes off a pasted name - the documented behaviour.
    return n.replace(/\.+$/, '');
}

// ---- one paste ----------------------------------------------------------------
function genPaste() {
    const tags = new Set();
    const T = (t) => { tags.add(t); return t; };
    const src = wpick([['plain', 4], ['imessage', 3], ['notes', 2], ['excel', 2], ['sheets', 1.5]]);
    T('src:' + src);
    const sheet = src === 'excel' || src === 'sheets';
    const size = wpick([[int(1, 4), 2], [int(5, 16), 4], [int(17, 40), 3]]);

    // ORDER
    let order = sheet ? wpick([['name_hcp', 3], ['trail_flight', 3]])
        : wpick([['name_hcp', 5], ['lead_flight', 3], ['trail_flight', 4], ['name_flight_hcp', 0.8], ['hcp_name', 0.6]]);
    const flightsOn = order !== 'name_hcp';
    // SEPARATOR
    let sep = sheet ? 'tab' : wpick([['sp1', 8], ['spN', 2], ['tab', 1], ['comma', 3], ['dash', 1.5], ['colon', 0.8], ['pipe', 0.5], ['slash', 0.5]]);
    if (order === 'hcp_name' || order === 'name_flight_hcp') sep = pick(['sp1', 'spN']);
    // HANDICAP
    let hcp = sheet ? wpick([['int', 3], ['dec0', 2], ['dec1', 2], ['plus', 1]])
        : wpick([['int', 5], ['dec0', 2], ['dec1', 3], ['plus', 1.5], ['plusdec', 1], ['paren', 1.2], ['word_before', 0.7], ['word_after', 0.5], ['none', 0.8], ['two_dec', 0.15], ['comma_dec', 0.15]]);
    if (hcp === 'comma_dec' && sep === 'comma') hcp = 'dec1';
    if (order === 'hcp_name' && /word|paren|none|_dec/.test(hcp)) hcp = 'int';
    if (order === 'name_flight_hcp' && hcp === 'none') hcp = 'int';
    if (sep === 'comma' && /word|paren/.test(hcp)) hcp = 'dec1';
    T('hcp:' + hcp);
    const someMissing = hcp !== 'none' && order !== 'hcp_name' && order !== 'name_flight_hcp' && chance(0.2);
    if (someMissing) T('hcp:some_missing');
    const placeholder = someMissing && !sheet && chance(0.2);
    if (placeholder) T('hcp:placeholder');
    // messy: per-line variation (tagged when a line actually varies)
    const mess = !sheet && order !== 'hcp_name' && order !== 'name_flight_hcp' && chance(0.3);
    const tees = !sheet && (order === 'name_hcp' || order === 'lead_flight') && hcp !== 'none' && chance(0.12);
    const multi = !sheet && order === 'name_hcp' && sep === 'sp1' && /^(int|dec0|dec1|plus)$/.test(hcp) && chance(0.04);
    // FLIGHT
    let flight = !flightsOn ? 'none'
        : (order === 'lead_flight' || sheet) ? wpick([['upper', 4], ['lower', 1]])
            : wpick([['upper', 6], ['lower', 2], ['word_after', 0.5], ['word_before', 0.5], ['paren', 0.6]]);
    if (order === 'name_flight_hcp' || order === 'hcp_name') flight = pick(['upper', 'lower']);
    T('flight:' + flight);
    const someUnlettered = flightsOn && order !== 'name_flight_hcp' && chance(0.12);
    if (someUnlettered) T('flight:some_unlettered');
    T('order:' + order);
    T('sep:' + sep);
    // BREAKS
    let brk = wpick([['none', 3], ['blank', 4], ['multi_blank', 1], ['ws_blank', 1], ['group_header', 3], ['number_header', 1.2], ['teetime_header', 1.5], ['flight_header', flightsOn ? 0 : 0.6]]);
    if (sheet && /header/.test(brk) && brk !== 'group_header') brk = 'blank';
    T('break:' + brk);
    // NUMBERING / BULLETS (not on spreadsheets)
    let num = sheet ? 'none' : wpick([['none', 8], ['paren', 1.2], ['dot', 1.2], ['dash', 0.3], ['hash', 0.3]]);
    if (brk === 'number_header' && num !== 'none') num = 'none';
    if (order === 'hcp_name') num = 'none';
    let bullet = (sheet || num !== 'none') ? 'none' : wpick([['none', 8], ['dot', src === 'notes' ? 3 : 0.8], ['dash', 1], ['star', 0.6], ['dot_tab', src === 'notes' ? 1 : 0.2]]);
    T('num:' + num); T('bullet:' + bullet);
    // WHITESPACE / SOURCE QUIRKS
    const crlf = sheet ? src === 'excel' || chance(0.3) : chance(0.12);
    const crOnly = !crlf && chance(0.02);
    const nbsp = (src === 'imessage' || src === 'notes') ? chance(0.35) : chance(0.05);
    const trailing = chance(sheet ? 0.3 : 0.15);
    const smart = src === 'imessage' || src === 'notes' ? chance(0.6) : false;
    const zw = chance(0.02);
    if (crlf) T('ws:crlf'); if (crOnly) T('ws:cr_only'); if (nbsp) T('ws:nbsp'); if (trailing) T('ws:trailing');
    if (smart) T('ws:smart_quotes'); if (zw) T('ws:zero_width');
    // SPREADSHEET SHAPE
    const xlHeader = sheet && chance(0.5);
    const xlFirstLast = sheet && chance(0.35);
    const xlIndex = sheet && chance(0.1);
    const xlEmptyHcpFlight = sheet && order === 'trail_flight' && chance(0.1);
    if (xlHeader) T('xl:header_row'); if (xlFirstLast) T('xl:first_last_cols'); if (xlIndex) T('xl:index_col');
    if (xlEmptyHcpFlight) T('xl:empty_hcp_with_flight');

    // GROUPS: 1-5 each, uneven
    const groupSizes = [];
    if (brk === 'none') groupSizes.push(size);
    else {
        let left = size;
        const target = pick([3, 4, 4, 4, 5, 2]);
        while (left > 0) { const g = Math.min(left, chance(0.7) ? target : int(1, 5)); groupSizes.push(g); left -= g; }
    }

    // NAMES
    const kinds = sheet ? [['plain', 5], ['two_word', 3], ['last_initial', 1], ['accented', 0.5], ['caps', 0.5]]
        : [['plain', 6], ['two_word', 3], ['jr_dot', 0.3], ['three_word', 1], ['last_initial', 2], ['apostrophe', 1], ['hyphen', 1], ['accented', 1],
            ['caps', 0.8], ['initials', 0.6], ['nickname_quotes', 0.4], ['emoji', 0.25], ['trailing_emoji', 0.2], ['last_first', 0.2]];
    const players = [];
    const used = new Set();
    for (let i = 0; i < size; i++) {
        let kind = wpick(kinds);
        // ambiguity the generator must not create on purpose:
        if (order === 'name_flight_hcp' && kind === 'last_initial') kind = 'plain';
        if (kind === 'last_first' && sep === 'comma') kind = 'plain';
        if (kind === 'trailing_emoji' && order !== 'name_hcp') kind = 'plain';
        if (kind === 'trailing_emoji' && tees) kind = 'plain';
        if (kind === 'jr_dot' && hcp === 'none') kind = 'plain';
        if (kind === 'emoji' && order === 'lead_flight') kind = 'plain';
        if (xlFirstLast && kind !== 'two_word') kind = 'two_word';
        let name = kind === 'trailing_emoji' ? pick(POOL.plain) : pick(POOL[kind]);
        if (smart) name = name.replace(/'/g, '’').replace(/"([^"]*)"/g, '“$1”');
        let tries = 0;
        while (used.has(name.toLowerCase()) && tries++ < 20) name = pick(POOL[kind === 'trailing_emoji' ? 'plain' : kind]) + (tries > 10 ? ' ' + String.fromCharCode(67 + int(0, 20)) : '');
        used.add(name.toLowerCase());
        const plus = chance(0.12) || hcp === 'plus' && chance(0.6) || hcp === 'plusdec' && chance(0.6);
        let v;
        if (plus) v = (hcp === 'dec1' || hcp === 'plusdec') ? int(1, 59) / 10 : int(1, 5);
        else v = chance(0.05) ? int(37, 54) : int(0, 36);
        if (!plus && (hcp === 'dec1') && v < 36) v = Math.round((v + int(0, 9) / 10) * 10) / 10;
        const hasHcp = hcp !== 'none' && !(someMissing && chance(0.25)) && !(xlEmptyHcpFlight && i % 3 === 1);
        const fl = flightsOn && !(someUnlettered && chance(0.3)) ? (chance(0.5) ? 'A' : 'B') : undefined;
        players.push({ kind, name, plus, v, hasHcp, flight: fl });
    }
    // DUPLICATES: the same name twice is two golfers, named in the review
    const dups = [];
    if (size >= 3 && chance(0.1)) {
        const a = players[0], b = players[int(1, size - 1)];
        b.name = chance(0.5) ? a.name : a.name.toUpperCase() === a.name ? a.name.toLowerCase() : a.name.toUpperCase();
        b.kind = a.kind;
        dups.push(a.name.toLowerCase());
        T('name:dup');
    }
    players.forEach(p => T('name:' + p.kind));
    if (order === 'trail_flight' && players.some(p => !p.hasHcp && p.flight)) T(sheet ? 'xl:empty_hcp_with_flight' : 'order:trail_flight_nohcp');

    if (multi) T('multi:per_line');
    const style = { tags, mess, placeholder, tees, multi, single: size === 1, src, sheet, order, sep, hcp, flight, brk, num, bullet, crlf, crOnly, nbsp, trailing, smart, zw, xlHeader, xlFirstLast, xlIndex };
    return { style, tags, players, groupSizes, dups };
}

// handicap text for a player in a style
function hcpText(p, style) {
    if (!p.hasHcp) return '';
    let n;
    if (style.hcp === 'dec0' || style.hcp === 'plusdec' && Number.isInteger(p.v)) n = p.v.toFixed(1);
    else if (style.hcp === 'dec1' || style.hcp === 'plusdec') n = Number.isInteger(p.v) ? p.v.toFixed(1) : String(p.v);
    else n = String(p.v);
    if (p.plus) n = '+' + n;
    switch (style.hcp) {
        case 'paren': return '(' + n + ')';
        case 'word_before': return pick(['hcp ', 'HCP: ', 'hdcp ', 'Hcp ', 'HCP ', 'handicap ']) + n;
        case 'word_after': return n + pick([' hcp', ' HCP', ' hdcp']);
        default: return n;
    }
}
function flightText(f, style) {
    if (!f) return '';
    const L = style.flight === 'lower' ? f.toLowerCase() : f;
    switch (style.flight) {
        case 'word_after': return L + pick([' flight', ' Flight']);
        case 'word_before': return pick(['Flight ', 'flight ']) + L;
        case 'paren': return '(' + L + ')';
        default: return L;
    }
}
const SEPS = { sp1: () => ' ', spN: () => pick(['  ', '   ']), tab: () => '\t', comma: () => pick([', ', ',']), dash: () => pick([' - ', ' – ']),
    colon: () => ': ', pipe: () => pick([' | ', '|']), slash: () => pick(['/', ' / ']) };

// one golfer line + what it must parse to
const TEES = ['Blue', 'White', 'Gold', 'Pintail Black'];
function renderGolfer(p, style0, lineNo) {
    // A MESSY LIST varies line by line: another separator, the name in lower case,
    // the other flight position, a bracketed note at the end.
    const style = Object.assign({}, style0);
    const tag = (t) => style0.tags && style0.tags.add(t);
    let lower = false, note = '', tee = null;
    if (style0.mess) {
        if (style.sep !== 'comma' && chance(0.25)) { const ns = pick(['sp1', 'spN', 'tab', 'dash', 'colon']); if (ns !== style.sep) { style.sep = ns; tag('mess:mixed_sep'); } }
        if (chance(0.15)) { lower = true; tag('mess:lowercase'); }
        if (chance(0.12)) { note = pick([' (captain)', ' (guest)', ' [sub]', ' (cart 3)', ' (new)']); tag('mess:note'); }
        if (p.flight && p.hasHcp && (style.order === 'lead_flight' || style.order === 'trail_flight') && style.flight !== 'paren' && !/word/.test(style.flight) && chance(0.2)) {
            style.order = style.order === 'lead_flight' ? 'trail_flight' : 'lead_flight'; tag('mess:mixed_order');
        }
    }
    if (style0.tees && p.hasHcp && chance(0.4)) { tee = pick(TEES); tag('tee:named'); }
    let H = hcpText(p, style);
    const F = flightText(p.flight, style);
    let N = lower ? p.name.toLowerCase() : p.name;
    let oddHcp = false;
    if (H && style.hcp === 'two_dec') { H = H.replace(/^([+]?\d+)(?:\.\d)?$/, (m, a) => a + '.' + int(10, 99)); oddHcp = true; }
    if (H && style.hcp === 'comma_dec') { H = H.replace(/^([+]?\d+)(?:\.\d)?$/, (m, a) => a + ',' + int(1, 9)); oddHcp = true; }
    if (!H && style0.placeholder && !p.flight) H = pick(['-', '?', 'N/A', 'n/a', 'NH', 'tbd', '--']);
    if (p.kind === 'last_first') N = p.name;      // "Orozco, Manny"
    let body;
    const sep = SEPS[style.sep]();
    const expect = { name: expectName(N), hcp: p.hasHcp ? (p.plus ? '+' : '') + p.v : '', plus: p.plus, flight: p.flight, teeName: tee || undefined };
    let safeOk = false, flagOk = oddHcp, alt = null;
    if (style.sheet) {
        const cells = [];
        if (style.xlIndex) cells.push(String(lineNo));
        if (style.xlFirstLast) { const sp = N.split(' '); cells.push(sp[0], sp.slice(1).join(' ')); } else cells.push(N);
        cells.push(H);
        if (style.order === 'trail_flight') cells.push(F);
        body = cells.join('\t').replace(/\t+$/, style.trailing ? '\t' : '');
        if (style.xlIndex) flagOk = true;
        // "Name<TAB><TAB>A": the empty cell says the A is in the flight column - exact.
    } else switch (style.order) {
        case 'name_hcp': body = N + (H ? sep + H : ''); break;
        case 'lead_flight': body = (F ? F + pick([' ', ' - ', ' · ', ': ', ', ', '\t']) : '') + N + (H ? sep + H : ''); break;
        case 'trail_flight': {
            if (H) {
                const fsep = style.sep === 'comma' ? ', ' : style.sep === 'tab' ? '\t' : style.sep === 'dash' ? ' - ' : pick(['/', ' ', ' / ', '/']);
                body = N + sep + H + (F ? fsep + F : '');
            } else {
                body = N + (F ? ' ' + F : '');
                if (F) { safeOk = /^[ABab]$/.test(F); alt = { name: N + ' ' + F, hcp: '', flight: undefined }; flagOk = true; }
            }
            break;
        }
        // AMBIGUOUS ("Matt B 12" is a last initial): the safe reading keeps the letter in
        // the name, and the line must be flagged - except a ONE-golfer paste, where
        // there is nothing to tell a flight list from a last initial.
        case 'name_flight_hcp': body = N + ' ' + F + sep + H; alt = { name: N + ' ' + F, hcp: expect.hcp, plus: expect.plus, flight: undefined }; flagOk = true; safeOk = !!style.single; break;
        case 'hcp_name': body = H + ' ' + N + (F ? ' ' + F : ''); flagOk = true; break;
    }
    if (p.kind === 'trailing_emoji') {
        const e = pick(['🔥', '⛳', '🏌\uFE0F\u200D♂\uFE0F']);
        body = body + ' ' + e;
        // after a handicap the emoji hides it ("Zack 12 🔥"): flagged. With no handicap
        // it is simply part of the name as typed.
        if (H) flagOk = true; else expect.name = N + ' ' + e;
    }
    if (p.kind === 'emoji' || p.kind === 'last_first') flagOk = true;
    if (tee) body += ' ' + (chance(0.5) ? tee.toLowerCase() : tee);
    if (note) body += note;
    // numbering / bullets
    if (style.num === 'paren') body = lineNo + ') ' + body;
    else if (style.num === 'dot') body = lineNo + '. ' + body;
    else if (style.num === 'dash') { body = lineNo + ' - ' + body; flagOk = true; }
    else if (style.num === 'hash') { body = '#' + lineNo + ' ' + body; flagOk = true; }
    if (style.bullet === 'dot') body = '• ' + body;
    else if (style.bullet === 'dash') body = '- ' + body;
    else if (style.bullet === 'star') body = '* ' + body;
    else if (style.bullet === 'dot_tab') body = '\t•\t' + body;
    if (style.nbsp) body = body.replace(/ /g, () => chance(0.5) ? '\u00A0' : ' ');
    if (style.zw) { body = body.replace(/^/, '\u200B'); flagOk = true; }
    if (style.trailing && !style.sheet) body += pick([' ', '  ', '\t', '\u00A0']);
    if (style.order === 'hcp_name') safeOk = false;
    if (oddHcp) alt = null;
    return { text: body, kind: 'golfer', expect, safeOk, flagOk, alt, player: p };
}

function header(style, gi) {
    const n = gi + 1;
    switch (style.brk) {
        case 'group_header': { const mm = String((10 + n * 8) % 60).padStart(2, '0');
            return pick(['Group ' + n, 'Group ' + n + ':', 'GROUP ' + n, 'Group ' + n + ' -', 'Group #' + n, 'Grp ' + n + ':', 'Foursome ' + n, 'Group ' + n + ' - 8:' + mm + ' AM', 'Group ' + n + ': 8:' + mm, 'group ' + n, 'Team ' + n + ':']); }
        case 'number_header': return pick([n + '.', n + ')', '#' + n, n + ':']);
        case 'teetime_header': { const mm = String(10 + (n * 8) % 50).padStart(2, '0'); const h = 7 + Math.floor(n / 6);
            return pick(['Tee time ' + h + ':' + mm, h + ':' + mm, h + ':' + mm + ' AM', h + ':' + mm + '\u202FAM', h + ':' + mm + 'am', 'Tee Time: ' + h + ':' + mm + ' AM', 'Tee time - ' + h + ':' + mm]); }
        case 'flight_header': return pick(['A Flight', 'Flight A', 'A flight:', 'Flight A:']).replace(/A/g, gi % 2 ? 'B' : 'A');
    }
    return null;
}

function buildText(G) {
    const s = G.style;
    const lines = [];     // {text, kind, ...}
    if (s.xlHeader) lines.push({ text: pick([['Name', 'HCP', 'Flight'], ['Player', 'Handicap', 'Flight'], ['Golfer', 'Hcp', 'Flt'], ['Name', 'Index', 'Flight']]).slice(0, s.order === 'trail_flight' ? 3 : 2).join('\t'), kind: 'sep' });
    let pi = 0, lineNo = 1;
    G.groupSizes.forEach((gs, gi) => {
        if (gi > 0) {
            if (s.brk === 'blank') lines.push({ text: '', kind: 'sep' });
            else if (s.brk === 'multi_blank') { lines.push({ text: '', kind: 'sep' }); lines.push({ text: pick(['', ' ']), kind: 'sep' }); }
            else if (s.brk === 'ws_blank') lines.push({ text: pick([' ', '  ', '\t', '\u00A0', ' \u00A0 ']), kind: 'sep' });
            else if (/header/.test(s.brk) && chance(0.4)) lines.push({ text: '', kind: 'sep' });
        }
        if (/header/.test(s.brk)) { let h = header(s, gi); if (s.nbsp) h = h.replace(/ /g, '\u00A0'); lines.push({ text: h, kind: 'sep', flightHeader: s.brk === 'flight_header' ? (gi % 2 ? 'B' : 'A') : null }); }
        for (let k = 0; k < gs; k++) {
            const p = G.players[pi++];
            const ln = renderGolfer(p, s, s.num !== 'none' && chance(0.5) ? k + 1 : lineNo);
            if (s.multi && k + 1 < gs && chance(0.6)) {
                // TWO GOLFERS ON ONE LINE ("Manny 8, Jimmy 11"): the roster paste reads one
                // golfer a line, so this can only be flagged.
                const p2 = G.players[pi++]; k++;
                const ln2 = renderGolfer(p2, Object.assign({}, s, { num: 'none', bullet: 'none', trailing: false }), lineNo);
                lines.push({ text: ln.text + pick([', ', ' & ', ' / ']) + ln2.text, kind: 'golfer', multi: true, expect: { name: '\u0000' }, flagOk: true, safeOk: false, alt: null, player: p });
            } else lines.push(ln);
            lineNo++;
        }
    });
    // a flight header gives its golfers that flight
    let cur = null;
    lines.forEach(l => { if (l.kind === 'sep' && l.flightHeader) cur = l.flightHeader; else if (l.kind === 'golfer' && cur && !l.expect.flight) l.expect.flight = cur; });
    if (chance(0.15)) lines.push({ text: '', kind: 'sep' });     // a trailing newline
    const eol = s.crlf ? '\r\n' : s.crOnly ? '\r' : '\n';
    return { lines, text: lines.map(l => l.text).join(eol), teeNames: s.tees ? TEES : [] };
}

// ---- the oracle ------------------------------------------------------------------
function hcpMatches(got, e) {
    const g = String(got == null ? '' : got).trim();
    if (e.hcp === '') return g === '';
    if (!/^[+-]?\d{1,2}(?:\.\d)?$/.test(g)) return false;
    const plusGot = g[0] === '+';
    if (plusGot !== !!e.plus) return false;
    return Math.abs(Math.abs(parseFloat(g)) - Math.abs(parseFloat(e.hcp))) < 1e-9;
}
const same = (got, e) => got && got.name === e.name && hcpMatches(got.hcp, e) && (got.flight || undefined) === (e.flight || undefined)
    && (got.teeName || undefined) === (e.teeName || undefined);

function judge(G, built, r) {
    const flagged = new Set();
    (r.flaggedLines || []).forEach(f => flagged.add(f.lineNumber));
    (r.flaggedFlights || []).forEach(f => flagged.add(f.lineNumber));
    (r.checkLines || []).forEach(f => flagged.add(f.lineNumber));
    // which player came from which line
    const byLine = {};
    let aligned = true;
    if (Array.isArray(r.playerLines)) r.playerLines.forEach((ln, j) => { byLine[ln] = r.validPlayers[j]; });
    else {
        // An older build: replicate its own rule - a line that is not a separator and not dropped.
        const parserLines = built.text.split('\n');
        const golferLines = [];
        parserLines.forEach((l, i) => { if (!R.rosterPasteSeparator(l.trim()) && !(r.flaggedLines || []).some(f => f.lineNumber === i + 1)) golferLines.push(i + 1); });
        if (golferLines.length !== r.validPlayers.length || parserLines.length !== built.lines.length) aligned = false;
        else golferLines.forEach((ln, j) => { byLine[ln] = r.validPlayers[j]; });
    }
    const out = [];
    built.lines.forEach((l, i) => {
        const ln = i + 1;
        const got = aligned ? byLine[ln] : undefined;
        if (l.kind === 'sep') {
            if (got) out.push({ ln, l, res: 'fail', why: 'phantom', got });
            return;
        }
        if (!aligned) { out.push({ ln, l, res: 'fail', why: 'misaligned', got: null }); return; }
        if (got && same(got, l.expect)) { out.push({ ln, l, res: 'exact', got, flagged: flagged.has(ln) }); return; }
        if (got && l.safeOk && l.alt && same(got, l.alt)) { out.push({ ln, l, res: 'safe', got }); return; }
        if (flagged.has(ln) && l.flagOk) { out.push({ ln, l, res: 'flagged', got }); return; }
        let why = !got ? 'dropped' : got.name !== l.expect.name ? 'name' : !hcpMatches(got.hcp, l.expect) ? 'hcp' : 'flight';
        if (flagged.has(ln)) why += '+flagged_but_common';
        out.push({ ln, l, res: 'fail', why, got });
    });
    // two golfers on one line are one parsed golfer, so the sizes cannot match there
    const groupsOk = G.style.multi || JSON.stringify(r.groups) === JSON.stringify(G.groupSizes);
    // the review names the same name twice - checked where both lines read exactly
    const dupOk = G.dups.every(d => out.filter(x => x.res === 'exact' && x.l.expect.name.toLowerCase() === d).length < 2
        || (r.duplicates || []).some(x => x.name.toLowerCase() === d));
    return { lines: out, groupsOk, dupOk };
}

// ---- run -------------------------------------------------------------------------
const stats = {};       // tag -> { pastes, pastesPass, lines, exact, safe, flagged, fail }
const reasons = {};
const examples = {};    // tag -> [ ... ]
let common = 0, commonPass = 0, rare = 0, rarePass = 0, totalLines = 0, falseFlags = 0;
const failingSeeds = [];
const S = (t) => (stats[t] = stats[t] || { cls: CLASS[t] || '?', pastes: 0, pastesPass: 0, lines: 0, exact: 0, safe: 0, flagged: 0, fail: 0 });

for (let n = 0; n < COUNT; n++) {
    // each paste has its own sub-seed, so one failure replays alone: --seed S --at n
    const sub = (SEED * 1000003 + n) >>> 0;
    if (arg('at', null) != null && n !== parseInt(arg('at'), 10)) continue;
    rand = rng(sub);
    const G = genPaste();
    const built = buildText(G);
    let r;
    try { r = R.parsePlayerPasteText(built.text, built.teeNames); }
    catch (e) { r = { validPlayers: [], groups: [], flaggedLines: [], error: String(e) }; }
    const J = judge(G, built, r);
    const isCommon = [...G.tags].every(t => CLASS[t] === 'COMMON');
    // a COMMON paste must have no failing line; a RARE one counts as passing the same way
    const pass = J.lines.every(x => x.res !== 'fail') && J.groupsOk && J.dupOk;
    if (isCommon) { common++; if (pass) commonPass++; else failingSeeds.push(n); } else { rare++; if (pass) rarePass++; }
    G.tags.forEach(t => { const s = S(t); s.pastes++; if (pass) s.pastesPass++; });
    if (!J.groupsOk) { reasons['groups'] = (reasons['groups'] || 0) + 1; const t = 'break:' + G.style.brk; (examples[t] = examples[t] || []).length < MAXFAILS && examples[t].push({ at: n, cls: isCommon ? 'COMMON' : 'RARE', what: 'groups', expected: G.groupSizes, got: r.groups, text: built.text.slice(0, 300) }); }
    if (!J.dupOk) reasons['duplicates'] = (reasons['duplicates'] || 0) + 1;
    J.lines.forEach(x => {
        totalLines++;
        if (x.res === 'exact' && x.flagged) falseFlags++;
        // a line's own tags: its name kind + the paste's format tags
        const lt = [...G.tags].filter(t => !t.startsWith('name:'));
        if (x.l.player) lt.push('name:' + x.l.player.kind);
        lt.forEach(t => { const s = S(t); s.lines++; s[x.res]++; });
        if (x.res === 'fail') {
            reasons[x.why] = (reasons[x.why] || 0) + 1;
            // blame the most specific non-default tag of the line for the example list
            const blame = lt.filter(t => CLASS[t] && !/:(none|plain|sp1|int|name_hcp|upper)$/.test(t));
            blame.forEach(t => { const ex = (examples[t] = examples[t] || []); if (ex.length < MAXFAILS) ex.push({ at: n, cls: isCommon ? 'COMMON' : 'RARE', why: x.why, line: x.l.text, expected: x.l.kind === 'sep' ? '(separator)' : x.l.expect, got: x.got || null }); });
        }
    });
    if (SHOW) {
        console.log('--- paste', n, isCommon ? 'COMMON' : 'RARE', pass ? 'PASS' : 'FAIL', [...G.tags].join(' '));
        console.log(JSON.stringify(built.text));
        J.lines.forEach(x => { if (x.res !== 'exact') console.log('  line', x.ln, x.res, x.why || '', JSON.stringify(x.l.text), '=>', JSON.stringify(x.got)); });
        console.log('  groups expected', JSON.stringify(G.groupSizes), 'got', JSON.stringify(r.groups));
    }
}

// ---- trip-setup-paste.js (the whole-round parser) over the same golfers -----------
let setup = null;
if (SETUP) {
    // It reads a day / groups / games plan; a golfer line there is one golfer per
    // line or several separated by commas. Measured only for the line shapes it
    // claims ("Manny 8", "Jimmy (11)", "Paul 3.5", "Lance +2", "B Ben 6") plus the
    // trailing-flight form, and only on golfer text (no headers): exact / flagged
    // (in its flags list) / fail.
    global.tripItinParseLine = undefined;
    const TSP = require(path.join(ROOT, 'trip-setup-paste.js'));
    rand = rng(SEED ^ 0x5eed);
    const fam = {};
    for (let n = 0; n < Math.min(COUNT, 2000); n++) {
        const order = pick(['name_hcp', 'lead_flight', 'trail_flight']);
        const style = { order, sep: pick(['sp1', 'sp1', 'tab']), hcp: pick(['int', 'dec0', 'dec1', 'paren', 'plus']), flight: 'upper', num: 'none', bullet: pick(['none', 'none', 'dot', 'dash']), src: 'plain' };
        const k = pick(['plain', 'two_word', 'last_initial', 'apostrophe', 'hyphen']);
        const p = { kind: k, name: pick(POOL[k]), plus: style.hcp === 'plus', v: int(1, 30), hasHcp: true, flight: order === 'name_hcp' ? undefined : pick(['A', 'B']) };
        if (style.order === 'trail_flight' && style.sep === 'tab') style.sep = 'sp1';
        const g = renderGolfer(p, style, 1);
        const res = TSP.parseSetupPaste('Group 1\n' + g.text, {});
        const got = ((res.days[0] || {}).groups || []).reduce((a, x) => a.concat(x.players), []);
        const flaggedHere = res.flags.some(f => f.line === 2);
        const key = 'order:' + order + ' hcp:' + style.hcp;
        const f = (fam[key] = fam[key] || { n: 0, exact: 0, flagged: 0, fail: 0, ex: [] });
        f.n++;
        if (got.length === 1 && same(got[0], g.expect)) f.exact++;
        else if (flaggedHere && got.length === 0) f.flagged++;
        else { f.fail++; if (f.ex.length < 2) f.ex.push({ line: g.text, expected: g.expect, got }); }
    }
    setup = fam;
}

const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
const families = {};
Object.keys(stats).sort().forEach(t => {
    const s = stats[t];
    families[t] = { class: s.cls, pastes: s.pastes, pastePass: pct(s.pastesPass, s.pastes), lines: s.lines, exact: s.exact, safe: s.safe, flagged: s.flagged, fail: s.fail, lineOk: pct(s.lines - s.fail, s.lines) };
});
const summary = {
    parser: path.relative(ROOT, PARSER) || PARSER, seed: SEED, count: COUNT,
    common: { pastes: common, pass: commonPass, rate: pct(commonPass, common) },
    rare: { pastes: rare, pass: rarePass, rate: pct(rarePass, rare) },
    lines: totalLines, exactButFlagged: falseFlags,
    failReasons: reasons,
    failingCommonPastes: failingSeeds.slice(0, 20),
    families,
    examples,
};
if (setup) summary.tripSetupPaste = setup;
if (!SHOW) console.log(JSON.stringify(summary, null, 1));
else console.log(JSON.stringify({ common: summary.common, rare: summary.rare }));
// exitCode, not exit(): exit() can cut off a large summary written to a pipe
process.exitCode = common - commonPass > 0 ? 1 : 0;
