// ============================================================================
// PASTE THE WHOLE TRIP / ROUND (gps-paste, 2026-10-11)
//
// One paste - a group chat, a booking email, a numbered list - becomes a PLAN:
// days (date, course, tee time), the groups each day (golfers + handicaps), the
// teams in a group ("Manny & Jimmy vs Paul & Marty"), and the games, mapped to the
// game types this app ALREADY has. Nothing here knows about a page, a database or
// the network: it turns text into a plan and lists everything it was unsure about.
// The review screen shows that, the golfer confirms, and the EXISTING setup flows
// do the writing (trip itinerary, trip roster, each day's Round Setup, Side Matches).
//
// It REUSES trip-itinerary.js (dates, times, courses, 27-hole nines) and
// roster-paste.js (a name and a handicap), loaded before it.
//
// GAMES THAT DO NOT EXIST HERE (Vegas, Bingo Bango Bongo, Snake, Rabbit, Hammer,
// Wheel, 9s) are FLAGGED AND SKIPPED - never mapped to something that merely looks
// close, because that would be a different bet.
//
// Plain var / function declarations (pages load this with <script src>).
// ============================================================================

var TSP_WEEKDAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5, sat: 6, saturday: 6 };
var TSP_WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Games that exist here: the round's game card, Money (Nassau, Skins) and Extras.
var TSP_FORMATS = [
    { re: /\bbest[\s-]?ball\b|\bbetter[\s-]?ball\b|\bfour[\s-]?ball\b/i, type: 'bestball', label: 'Best Ball' },
    { re: /\bscramble\b/i, type: 'scramble', label: 'Scramble' },
    { re: /\bstableford\b/i, type: 'stableford', label: 'Stableford' },
    { re: /\bhi[\s-]?lo\b|\bhigh[\s-]?low\b/i, type: 'hilo', label: 'Hi-Lo' },
    { re: /\bteam match\b/i, type: 'ryder', label: 'Team Match' },
    { re: /\bstroke play\b|\bmedal\b|\bstroke\b/i, type: 'stroke', label: 'Stroke Play' },
];
// Games that do NOT exist here: flagged, skipped. (Vegas and Bingo Bango Bongo exist
// since gps-games: their own engines, set up on Round Setup's Money step.)
var TSP_UNKNOWN = /\b(snake|rabbit|hammer|wheel|9s|nines game|chicago|quota|banker|aces and deuces|round robin|sixes)\b/i;
var TSP_GAME_WORD = /\bnassau\b|\bskins?\b|\bwolf\b|\bbirdie game\b|\bbirdies\b|\bdots\b|\bgreenies\b|best[\s-]?ball|better[\s-]?ball|four[\s-]?ball|\bscramble\b|\bstableford\b|\bhi[\s-]?lo\b|\bteam match\b|\bstroke play\b|\bmedal\b|\bstroke\b|\bvegas\b|bingo[\s-]?bango|\bbbb\b|\bsnake\b|\brabbit\b|\bhammer\b|\bwheel\b|\bchicago\b|\bquota\b|\bbanker\b|\bround robin\b|\bsixes\b/i;

function tspClean(line) {
    return String(line || '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')          // emoji
        .replace(/^\s*(?:[-*•▪●>]+|\(?\d{1,2}[.)]|[a-z][.)])\s+/i, '')   // bullets, "1." "2)" "a."
        .replace(/[–—]/g, ' - ')                                               // en / em dash
        .replace(/\s+/g, ' ').trim();
}
// "Tuesday, October 13" -> "Tue October 13" (the itinerary parser's shapes).
function tspDateText(s) {
    return s.replace(/\b(sunday|monday|tuesday|tues|wednesday|weds|thursday|thurs|thur|friday|saturday)\b,?/ig, function (w) {
        return TSP_WEEKDAY_SHORT[TSP_WEEKDAYS[w.toLowerCase().replace(/,$/, '')]];
    }).replace(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat),/g, '$1');
}
function tspMoney(s) {
    var m = /\$\s?(\d+(?:\.\d{1,2})?)/.exec(s) || /\b(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|per\b|a\s+(?:point|skin|hole)|\/(?:pt|point|skin|hole))/i.exec(s);
    return m ? Number(m[1]) : null;
}

// ---- GAMES -------------------------------------------------------------------------
// One phrase ("$5 nassau auto press", "skins $2 carry", "wolf $1") -> games + flags.
function tspGames(text) {
    var out = [], flags = [];
    var parts = String(text || '').split(/[,;]|\s\+\s|\band\b(?=\s*\$?\d*\s*(?:nassau|skins?|wolf|birdie|dots|greenies|vegas|bingo|bbb))/i).map(function (p) { return p.trim(); }).filter(Boolean);
    parts.forEach(function (p) {
        var unknown = TSP_UNKNOWN.exec(p);
        if (unknown) { flags.push({ level: 'skip', text: p, why: '"' + unknown[1] + '" is not a game in this app - skipped' }); return; }
        var everyone = /\b(everyone|all|whole field|field)\b/i.test(p);
        if (/\bnassau\b/i.test(p)) {
            var tri = /\$?\s?(\d+(?:\.\d+)?)\s*[\/-]\s*\$?\s?(\d+(?:\.\d+)?)\s*[\/-]\s*\$?\s?(\d+(?:\.\d+)?)/.exec(p);
            var amt = tspMoney(p);
            var g = { type: 'nassau', label: 'Nassau', raw: p, everyone: everyone };
            if (tri) { g.front = +tri[1]; g.back = +tri[2]; g.overall = +tri[3]; }
            else if (amt != null) { g.front = amt; g.back = amt; g.overall = amt; }
            g.press = /auto[\s-]?press/i.test(p) ? 'auto' : (/\bpress(es)?\b/i.test(p) ? 'manual' : null);
            out.push(g);
            if (g.front == null) flags.push({ level: 'ask', text: p, why: 'Nassau with no amount' });
            return;
        }
        if (/\bskins?\b/i.test(p)) {
            var s = { type: 'skins', label: 'Skins', raw: p, amount: tspMoney(p), carry: /\bno[\s-]?carry\b/i.test(p) ? false : (/\bcarry/i.test(p) ? true : null), everyone: everyone };
            out.push(s);
            if (s.amount == null) flags.push({ level: 'ask', text: p, why: 'Skins with no amount' });
            return;
        }
        // VEGAS / BINGO BANGO BONGO (gps-games): before the birdie game, so "vegas $1
        // birdie flip" stays Vegas.
        if (/\bvegas\b/i.test(p)) {
            var vg = { type: 'vegas', label: 'Vegas', raw: p, perPoint: tspMoney(p), flip: /\bflip/i.test(p) };
            out.push(vg);
            if (vg.perPoint == null) flags.push({ level: 'ask', text: p, why: 'Vegas with no $ per point' });
            return;
        }
        if (/bingo[\s-]?bango[\s-]?bongo|\bbbb\b|\bbingo\b/i.test(p)) {
            var bb = { type: 'bbb', label: 'Bingo Bango Bongo', raw: p, perPoint: tspMoney(p) };
            out.push(bb);
            if (bb.perPoint == null) flags.push({ level: 'ask', text: p, why: 'Bingo Bango Bongo with no $ per point' });
            return;
        }
        if (/\bwolf\b/i.test(p)) { out.push({ type: 'wolf', label: 'Wolf', raw: p, perPoint: tspMoney(p), format: true }); return; }
        if (/\bbirdie game\b|\bbirdies\b/i.test(p)) { out.push({ type: 'birdie', label: 'Birdie game', raw: p, amount: tspMoney(p) }); return; }
        // "greenies" in a paste is read as the Dots game - and shown as Dots (the app's word).
        if (/\bdots\b|\bgreenies\b/i.test(p)) { out.push({ type: 'dots', label: 'Dots', raw: p, amount: tspMoney(p) }); return; }
        for (var i = 0; i < TSP_FORMATS.length; i++) {
            if (TSP_FORMATS[i].re.test(p)) { out.push({ type: TSP_FORMATS[i].type, label: TSP_FORMATS[i].label, raw: p, format: true, amount: tspMoney(p) }); return; }
        }
        if (TSP_GAME_WORD.test(p) || /\$\d/.test(p)) flags.push({ level: 'warn', text: p, why: 'Not sure which game this is - not added' });
    });
    return { games: out, flags: flags };
}
// Where on a line the games start: "... Marty 9   $10 nassau auto press", "... - wolf $1".
function tspSplitGames(s) {
    var m = /(?:\s-\s|\s{2,}|\s)(?=(?:\$\s?\d|\d+\s*\/\s*\d+\s*\/\s*\d|games?:|bets?:)|\b(?:nassau|skins?|wolf|birdie game|dots|greenies|best[\s-]?ball|better[\s-]?ball|four[\s-]?ball|scramble|stableford|hi[\s-]?lo|team match|stroke play|medal|vegas|bingo|bbb|snake|rabbit|hammer)\b)/i.exec(' ' + s);
    if (!m) return { head: s, games: '' };
    var at = Math.max(0, m.index - 1);
    return { head: s.slice(0, at).replace(/[\s,:-]+$/, ''), games: s.slice(at).replace(/^[\s,:-]+|^(games?|bets?)\s*:?\s*/ig, '').trim() };
}

// ---- GOLFERS -------------------------------------------------------------------------
// "Manny 8", "Jimmy (11)", "Paul 3.5", "Lance +2", "B Ben 6" (flight letter).
function tspPlayer(tok) {
    var t = String(tok || '').replace(/^[\s,.:-]+|[\s,.:]+$/g, '');
    if (!t) return null;
    var hcp = '';
    var br = /^(.*?)\s*[(\[]\s*([+-]?\d{1,2}(?:\.\d)?)\s*[)\]]\s*$/.exec(t);
    if (br) { t = br[1]; hcp = br[2]; }
    else {
        var bare = /^(.+?)\s+([+-]?\d{1,2}(?:\.\d)?)$/.exec(t);
        if (bare && +bare[2] >= -10 && +bare[2] <= 54) { t = bare[1]; hcp = bare[2]; }
    }
    var flight = null;
    // "Skeens 2.0/A", "Skeens 2.0 A", "Glenn (12) B" (013 + URGENT-008): a handicap THEN a flight
    // at the end of the line, read the way Paste Player List reads them (roster-paste.js), with
    // the bracketed form as a fallback. Only right after a handicap, so "Matt B" stays a name.
    var tr = !hcp && typeof splitTrailingHcpFlight === 'function' ? splitTrailingHcpFlight(t) : null;
    if (tr && tr.flight) { t = tr.name; hcp = tr.hcp; flight = tr.flight; }
    if (!hcp) {
        var tf = /^(.+?)\s+[(\[]?\s*([+-]?\d{1,2}(?:\.\d)?)\s*[)\]]?\s+([ABab])$/.exec(t);
        if (tf && +tf[2] >= -10 && +tf[2] <= 54) { t = tf[1]; hcp = tf[2]; flight = tf[3].toUpperCase(); }
    }
    var fl = flight ? null : /^([AB])\s+(\S.*)$/.exec(t);
    if (fl) { flight = fl[1]; t = fl[2]; }
    t = t.replace(/\s+/g, ' ').trim();
    // A name: 1-3 words, letters (an initial, an apostrophe, a hyphen are fine).
    if (!/^[A-Za-z][A-Za-z.'’-]*(?: [A-Za-z][A-Za-z.'’-]*){0,2}$/.test(t) || t.length > 30) return null;
    // A LONE LETTER IS NOT A GOLFER (URGENT-008): it is a flight that lost its golfer
    // ("Skeens 2.0/A" split at the slash) - flagged on review, never a player "A".
    if (/^[A-Za-z]$/.test(t)) return null;
    var p = { name: t, hcp: hcp };
    if (flight) p.flight = flight;
    return p;
}
// A line of golfers: commas, "&", "and", "/", "+"; "vs" / "v" makes two teams.
function tspPlayersLine(s) {
    // "Manny Orozco, 12" is a handicap, not a second golfer called "12": a comma
    // followed by a number alone reads as "Manny Orozco (12)".
    s = String(s || '').replace(/,\s*([+-]?\d{1,2}(?:\.\d)?)\s*(?=$|[,;&\/]|\s+(?:vs\.?|v\.?|versus)\s)/gi, ' ($1)');
    // "Skeens 2.0/A", "Tim (16) / B": the slash between a handicap and a flight joins
    // them - it is not a second golfer called "A". Only when the letter ENDS that golfer (end
    // of line, a comma / & next, or "vs"): "Manny 8 / B Jimmy 11" is two golfers, the second in B. And "B, Paul 23", "A: Jim 4",
    // "A - Jim 4", "A \u00B7 Randy T 12" (Manny's list): a leading flight set off by a
    // comma, colon, dash or middot is the flight, not a golfer "B" or a line ignored.
    s = s.replace(/([+-]?\d{1,2}(?:\.\d)?\)?)\s*\/\s*([ABab])(?=\s*$|\s*[,;&]|\s+(?:vs\.?|v\.?|versus)\s)/g, '$1 $2')
        .replace(/^\s*([AB])\s*(?:[,:\u00B7\u2022]|-{1,2}|\.{2,3})\s*(?=[A-Za-z][A-Za-z.'\u2019-])/, '$1 ');
    var sides = s.split(/\s+(?:vs\.?|v\.?|versus)\s+/i);
    var teams = sides.length === 2 ? [] : null;
    var players = [], bad = [];
    sides.forEach(function (side) {
        // "+" joins names ("Manny + Jimmy") only when a NAME follows - "Marty +2" is a handicap.
        var names = side.split(/\s*(?:,|&|\/|\band\b)\s*|\s\+\s*(?=[A-Za-z])/i).filter(Boolean);
        var team = [];
        names.forEach(function (n) {
            var p = tspPlayer(n);
            if (p) { players.push(p); team.push(p.name); } else bad.push(n);
        });
        if (teams) teams.push(team);
    });
    return { players: players, teams: teams && teams[0].length && teams[1].length ? teams : null, bad: bad };
}

// ---- THE PLAN --------------------------------------------------------------------------
// opts: { year } (dates with no year). Returns
//   { days: [{ n, date, dateUnsure, weekday, time, courseName, nines, undecided, options,
//              games: [...], groups: [{ label, time, players: [{ name, hcp, flight }],
//              teams: [[names], [names]] | null, games: [...] }], raw }],
//     players: [{ name, hcp }], flags: [{ day, line, text, why, level }] }
function parseSetupPaste(text, opts) {
    var o = opts || {};
    var lines = String(text || '').split(/\r?\n/);
    var days = [], flags = [], cur = null, group = null;
    var flag = function (line, txt, why, level) { flags.push({ day: cur ? cur.n : null, line: line, text: txt, why: why, level: level || 'warn' }); };
    var newDay = function (raw) { cur = { n: days.length + 1, date: null, dateUnsure: false, weekday: null, time: null, courseName: null, games: [], groups: [], raw: raw }; days.push(cur); group = null; return cur; };
    var ensureDay = function () { return cur || newDay(''); };
    var newGroup = function (label, time) { ensureDay(); group = { label: label || ('Group ' + (cur.groups.length + 1)), time: time || null, players: [], teams: null, games: [] }; cur.groups.push(group); return group; };
    var addGames = function (txt, ln, target) {
        var g = tspGames(txt);
        g.flags.forEach(function (f) { flag(ln, f.text, f.why, f.level); });
        (target || (group ? group.games : ensureDay().games)).push.apply(target || (group ? group.games : cur.games), g.games);
    };
    var addPlayers = function (txt, ln, startGroup) {
        var r = tspPlayersLine(txt);
        if (!r.players.length) return false;
        if (startGroup || !group) newGroup();
        r.players.forEach(function (p) { group.players.push(p); });
        if (r.teams) group.teams = r.teams;
        r.bad.forEach(function (b) { flag(ln, b, 'Not a name I can read - left out', 'warn'); });
        return true;
    };
    var blankBefore = false;
    lines.forEach(function (rawLine, idx) {
        var ln = idx + 1;
        var s = tspClean(rawLine);
        if (!s) { blankBefore = true; return; }
        var startGroup = blankBefore; blankBefore = false;
        // "same groups" / "same foursomes": the day before's groups again.
        if (/^same (groups|foursomes|pairings|teams)\b/i.test(s) || /\bsame (groups|foursomes|pairings)\b/i.test(s) && days.length > 1) {
            var prev = days[days.length - 2];
            if (cur && prev) { cur.groups = JSON.parse(JSON.stringify(prev.groups)); group = cur.groups[cur.groups.length - 1] || null; }
            else flag(ln, s, '"Same groups" but there is no earlier day', 'warn');
            var rest0 = s.replace(/^.*?\bsame (groups|foursomes|pairings|teams)\b[\s,.:-]*/i, '');
            if (rest0) addGames(rest0, ln, cur.games);
            return;
        }
        // GAMES LINE: "games: $5 nassau, $2 skins", or nothing but games.
        var gm = /^(games?|bets?|playing)\s*:?\s*(.+)$/i.exec(s);
        // A "games:" line is the whole DAY's (every group); a game on a group's own line is that group's.
        if (gm) { addGames(gm[2], ln, ensureDay().games); return; }
        // A DAY: a date, a weekday, or "Day 2".
        var sameAsBefore = /\bsame (groups|foursomes|pairings|teams)\b/i.test(s);
        if (sameAsBefore) s = s.replace(/[\s,;-]*\bsame (groups|foursomes|pairings|teams)\b[\s,;.-]*/i, ' ').replace(/\s+/g, ' ').trim();
        var dayText = tspDateText(s);
        var it = typeof tripItinParseLine === 'function' ? tripItinParseLine(dayText, { year: o.year }) : null;
        var wd = /^(?:on\s+)?(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b[\s,:-]*(?:at\s+)?/i.exec(s);
        var dayN = /^day\s*(\d+)\b[\s,:-]*/i.exec(s);
        // "Saturday game!!!" is a title, not a day at a course called "game!!!": a
        // weekday with no date and no tee time whose rest is chatter.
        if (wd && !(it && it.date)) {
            var after = s.slice(wd[0].length);
            if (!(typeof tripItinTime === 'function' && tripItinTime(after)) && (/!/.test(after) || /^(game|games|golf|round|rounds|trip|golf trip|plans?|tee times?)\b/i.test(after.trim()) || !after.trim())) {
                if (after.trim()) { flag(ln, s, 'Not understood - ignored', days.length ? 'warn' : 'info'); return; }
            }
        }
        if ((it && it.date) || wd || dayN) {
            var split = tspSplitGames(it && it.date ? dayText : s);
            var d = newDay(s);
            if (it && it.date) {
                var it2 = tripItinParseLine(split.head, { year: o.year }) || it;
                d.date = it2.date || it.date; d.dateUnsure = !!it2.usedDefaultYear; d.time = it2.time || null;
                d.courseName = it2.courseName || null; if (it2.nines) d.nines = it2.nines;
                if (it2.undecided) { d.undecided = true; d.options = it2.options; }
                if (!d.courseName && !d.undecided) flag(ln, s, 'A day with no course name', 'ask');
            } else {
                var rest = split.head.slice((wd || dayN)[0].length);
                d.weekday = wd ? TSP_WEEKDAY_SHORT[TSP_WEEKDAYS[wd[1].toLowerCase()]] : null;
                var t = typeof tripItinTime === 'function' ? tripItinTime(rest) : null;
                d.time = t ? t.time : null;
                var c = typeof tripItinCourse === 'function' ? tripItinCourse(rest) : null;
                d.courseName = c ? c.name : null; if (c && c.nines) d.nines = c.nines;
                flag(ln, s, (wd ? d.weekday : 'Day ' + dayN[1]) + ' has no date - pick it on review', 'ask');
                if (!d.courseName) flag(ln, s, 'A day with no course name', 'ask');
            }
            if (split.games) addGames(split.games, ln, d.games);
            if (sameAsBefore) {
                var before = days[days.length - 2];
                if (before && before.groups.length) d.groups = JSON.parse(JSON.stringify(before.groups)).map(function (g) { g.games = []; return g; });
                else flag(ln, s, '"Same groups" but there is no earlier day with groups', 'warn');
            }
            return;
        }
        // A GROUP: "Group 1: ...", "Foursome A - ...", "8:24 - ...", "Team 1: ...".
        var gh = /^(group|grp|foursome|fourball|threesome|pairing|tee time|team|flight)\s*([A-Z0-9]{0,3})\b\s*[:.)-]?\s*/i.exec(s)
            || /^(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[:-]\s*/i.exec(s);
        if (gh) {
            var label = gh[1] && /^\d/.test(gh[1]) ? null : (gh[1].charAt(0).toUpperCase() + gh[1].slice(1).toLowerCase() + (gh[2] ? ' ' + gh[2] : ''));
            var timeG = gh[1] && /^\d/.test(gh[1]) ? gh[1] : null;
            // SIDES IN BRACKETS on the group line: "GROUP 1 - $5 NASSAU (Manny & Joe vs
            // Mike & Dave)". Taken out of the line and matched to the group's golfers below.
            var rest = s.slice(gh[0].length), vsSides = null;
            rest = rest.replace(/\(([^()]*\s(?:vs\.?|v\.?|versus)\s[^()]*)\)/i, function (m0, inner) {
                var two = inner.split(/\s+(?:vs\.?|v\.?|versus)\s+/i);
                if (two.length === 2) vsSides = two.map(function (side) { return side.split(/\s*(?:&|\/|\+|,|\band\b)\s*/i).map(function (x) { return x.trim(); }).filter(Boolean); });
                return ' ';
            });
            var sp = tspSplitGames(rest);
            if (/^team$/i.test(gh[1]) && group && !startGroup && group.players.length && !group.teams) {
                // "Team 1: A, B" then "Team 2: C, D": two teams of one group.
                var r1 = tspPlayersLine(sp.head);
                group.pendingTeams = group.pendingTeams || [];
                group.pendingTeams.push(r1.players.map(function (p) { return p.name; }));
                r1.players.forEach(function (p) { group.players.push(p); });
            } else {
                newGroup(label || ('Group ' + ((cur ? cur.groups.length : 0) + 1)), timeG);
                if (/^team$/i.test(gh[1])) { var r2 = tspPlayersLine(sp.head); group.pendingTeams = [r2.players.map(function (p) { return p.name; })]; r2.players.forEach(function (p) { group.players.push(p); }); }
                else if (sp.head) addPlayers(sp.head, ln, false);
            }
            if (sp.games) addGames(sp.games, ln, group.games);
            if (vsSides && vsSides[0].length && vsSides[1].length) group.vsNames = vsSides;
            return;
        }
        // GOLFERS (with games after them, maybe).
        var sp2 = tspSplitGames(s);
        if (sp2.head && addPlayers(sp2.head, ln, startGroup)) { if (sp2.games) addGames(sp2.games, ln, group.games); return; }
        // ONLY GAMES on the line.
        if (!sp2.head && sp2.games) { addGames(sp2.games, ln, group && !startGroup ? group.games : ensureDay().games); return; }
        // A title or chatter ("Myrtle trip!!", "Here's the plan"): not a round.
        flag(ln, s, 'Not understood - ignored', days.length || group ? 'warn' : 'info');
    });
    // A DAY WITH NO GROUPS after one that had them: ask (same groups as before?).
    days.forEach(function (d, i) {
        if (d.groups.length) return;
        var prevWith = days.slice(0, i).reverse().filter(function (x) { return x.groups.length; })[0];
        if (prevWith) flags.push({ day: d.n, line: null, text: 'Day ' + d.n, why: 'No groups listed - use Day ' + prevWith.n + '\u2019s groups?', level: 'ask', sameAs: prevWith.n });
    });
    // TEAMS NAMED ON THE GROUP LINE: each name is a golfer of that group - the full name,
    // or the one golfer whose first name (or name start) it is. All found: those are the
    // sides, and nothing is asked. Any name not found: the review asks, as before.
    days.forEach(function (d) {
        d.groups.forEach(function (g) {
            if (!g.vsNames || g.teams) { delete g.vsNames; return; }
            var used = {}, ok = true;
            var find = function (n) {
                var k = String(n).toLowerCase().replace(/\.$/, '');
                var hits = g.players.filter(function (p) { var pn = p.name.toLowerCase(); return !used[p.name] && (pn === k || pn.split(' ')[0] === k || pn.indexOf(k + ' ') === 0); });
                if (hits.length !== 1) { ok = false; return null; }
                used[hits[0].name] = 1;
                return hits[0].name;
            };
            var t = g.vsNames.map(function (side) { return side.map(find); });
            if (ok && t[0].length === t[1].length) g.teams = t;
            delete g.vsNames;
        });
    });
    // TEAMS from "Team 1: / Team 2:" lines.
    days.forEach(function (d) { d.groups.forEach(function (g) { if (g.pendingTeams) { if (g.pendingTeams.length === 2) g.teams = g.pendingTeams; delete g.pendingTeams; } }); });
    // NASSAU: team vs team when the group names teams; two golfers: them; else ask.
    days.forEach(function (d) {
        d.groups.forEach(function (g) {
            var nas = g.games.concat(d.games).filter(function (x) { return x.type === 'nassau'; });
            nas.forEach(function (x) {
                var vs = g.teams ? 'teams' : (g.players.length === 2 ? 'pair' : 'ask');
                if (vs === 'ask') flags.push({ day: d.n, line: null, text: g.label + ': ' + x.raw, why: 'Who plays whom in this Nassau? Pick the sides on review', level: 'ask' });
            });
        });
    });
    // CHECKS a golfer would want to know about.
    var hcpBy = {}, roster = [];
    days.forEach(function (d) {
        var seen = {};
        d.groups.forEach(function (g) {
            if (g.players.length > 5) flags.push({ day: d.n, line: null, text: g.label, why: g.label + ' has ' + g.players.length + ' golfers', level: 'warn' });
            if (g.teams) {
                var inTeams = g.teams[0].concat(g.teams[1]);
                var left = g.players.filter(function (p) { return inTeams.indexOf(p.name) === -1; });
                if (left.length) flags.push({ day: d.n, line: null, text: g.label, why: 'Not on a team: ' + left.map(function (p) { return p.name; }).join(', '), level: 'info' });
            }
            g.players.forEach(function (p) {
                var k = p.name.toLowerCase();
                if (seen[k]) flags.push({ day: d.n, line: null, text: p.name, why: p.name + ' is in two groups on the same day', level: 'warn' });
                seen[k] = 1;
                if (p.hcp !== '') {
                    if (hcpBy[k] != null && hcpBy[k] !== p.hcp) flags.push({ day: d.n, line: null, text: p.name, why: p.name + ' has two handicaps (' + hcpBy[k] + ' and ' + p.hcp + ')', level: 'ask' });
                    if (hcpBy[k] == null) hcpBy[k] = p.hcp;
                }
                if (!roster.some(function (r) { return r.name.toLowerCase() === k; })) roster.push({ name: p.name, hcp: p.hcp });
            });
        });
    });
    roster.forEach(function (r) { if (!r.hcp && hcpBy[r.name.toLowerCase()] != null) r.hcp = hcpBy[r.name.toLowerCase()]; });
    return { days: days, players: roster, flags: flags };
}

// A day's games for one group (the day's + the group's own), and the format card to use.
function tspGroupGames(day, group) { return day.games.concat(group.games); }
function tspDayFormat(day) {
    var all = day.games.slice();
    day.groups.forEach(function (g) { all = all.concat(g.games); });
    var f = all.filter(function (x) { return x.format; });
    return f.length ? f[0] : null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseSetupPaste: parseSetupPaste, tspGames: tspGames, tspPlayersLine: tspPlayersLine, tspPlayer: tspPlayer, tspClean: tspClean,
        tspSplitGames: tspSplitGames, tspGroupGames: tspGroupGames, tspDayFormat: tspDayFormat, TSP_UNKNOWN: TSP_UNKNOWN };
}
