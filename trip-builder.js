// ============================================================================
// HardPan — THE TRIP BUILDER (gps-builder, 2026-10-11)
//
// One paste describes the whole trip; this turns it into ONE plan (every day's
// course, tee times, Cup format, groups, sides and games), the QUESTIONS the
// paste leaves open (each with the likely answer already picked), and finally
// the exact Firebase writes: the trip, every round with its full setup, and the
// Ryder Cup. trip-builder-ui.js shows the plan on one review screen and does the
// one write, the way trip.html's Build Trip does.
//
// WHAT IT REUSES (nothing here is a second copy of a builder):
//   tspGames (trip-setup-paste.js)      "$5 Nassau, $1 Vegas birdie flip" -> games
//   tripItinDate / tripItinMatch        dates and saved-course matching
//   buildNassauWagerPayload (action-model.js, via sideMatchPayloadFromTerms)
//   buildRyderCupConfig (ryder-cup.js)  the Cup, untouched; its sessions are data
//   validateMoneyPool (pool-engine.js)  the KP pot must balance before it is written
//   HardPanExtraGames.addGame shape     Vegas / Bingo Bango Bongo instances
// Each is passed in through `ctx`, so this file is pure and testable.
//
// WHAT THE CUP ENGINE CANNOT DO (ryder-cup.js is not changed): a match worth 2
// points, front 9 / back 9 points, "first to X", captains, and a Cup total that
// adds every round's session on screen. The plan keeps them (trip notes, the
// trip's builder record) and the review says so - nothing is silently dropped.
// ============================================================================
(function (root) {
    'use strict';

    var DASH = /\s+[-–—]\s+|\s*[–—]\s*/;
    var TIME = /\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/ig;

    function clean(s) { return String(s == null ? '' : s).replace(/½/g, '.5').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim(); }
    function num(s) { var n = parseFloat(s); return isNaN(n) ? null : n; }
    function cap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
    function key(s) { return String(s || '').trim().toLowerCase(); }
    function times(s) {
        var out = [], m;
        TIME.lastIndex = 0;
        while ((m = TIME.exec(s))) {
            var h = +m[1], mm = m[2], ap = (m[3] || '').charAt(0).toLowerCase();
            if (ap === 'p' && h < 12) h += 12;
            if (ap === 'a' && h === 12) h = 0;
            // A morning golf time: 1:00-5:59 with no am/pm is afternoon.
            if (!ap && h >= 1 && h <= 5) h += 12;
            out.push((h < 10 ? '0' : '') + h + ':' + mm);
        }
        return out;
    }
    // "Manny & Joe", "Manny/Joe", "Manny and Joe" -> names
    function names(s) {
        return String(s || '').split(/\s*(?:&|\/|\+|,|\band\b)\s*/i).map(function (x) {
            return cap(x.replace(/\((?:captain|capt|c)\)/i, '').replace(/[^A-Za-z' .-]/g, '').trim());
        }).filter(Boolean);
    }

    var FORMATS = [
        { type: 'foursomes', re: /foursomes?|alternate[\s-]?shot|alt[\s-]?shot/i, label: 'Foursomes (alternate shot)' },
        { type: 'singles', re: /\bsingles?\b|one[\s-]?on[\s-]?one/i, label: 'Singles' },
        { type: 'fourball', re: /four[\s-]?ball|best[\s-]?ball|better[\s-]?ball/i, label: 'Four-ball (best ball)' },
        { type: 'scramble', re: /\bscramble\b/i, label: 'Scramble' }
    ];
    function readFormat(s) {
        var f = FORMATS.filter(function (x) { return x.re.test(s); })[0];
        var pts = /(\d+(?:\.\d+)?)\s*points?\s*(?:per|a|each)\s*match/i.exec(s);
        return {
            type: f ? f.type : null, label: f ? f.label : clean(s),
            matchPlay: /match\s*play/i.test(s) || !!f,
            points: pts ? +pts[1] : null,
            nines: /front\s*9|front\s*nine|back\s*9|per\s*nine|each\s*nine/i.test(s),
            raw: clean(s)
        };
    }

    // ---- THE PARSE -----------------------------------------------------------
    // opts: { year, tspGames, tripItinDate }
    function parseTrip(text, opts) {
        var o = opts || {};
        var games = o.tspGames || function () { return { games: [], flags: [] }; };
        var plan = { name: null, cup: null, teams: [], golfers: [], days: [], notes: [], unread: [] };
        var day = null, inTeams = false;
        var lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
        var seen = {};
        var addGolfer = function (n) { if (n && !seen[key(n)]) { seen[key(n)] = true; plan.golfers.push(n); } };

        lines.forEach(function (line, i) {
            var m;
            if ((m = /^(?:trip|trip name|event)\s*:\s*(.+)$/i.exec(line))) { plan.name = m[1]; return; }
            if (/^teams?\s*:?\s*$/i.test(line)) { inTeams = true; return; }
            // DAY 1 - Tue Oct 13 - Caledonia, 9:10 & 9:20
            if ((m = /^day\s*(\d+)\b\s*[:.-]?\s*(.*)$/i.exec(line)) || (m = /^((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s+\S+.*)$/i.exec(line)) && /\d/.test(line) && !/^group/i.test(line)) {
                inTeams = false;
                var rest = m.length > 2 ? m[2] : m[1];
                var parts = rest.split(DASH).map(clean).filter(Boolean);
                day = { n: m.length > 2 ? +m[1] : plan.days.length + 1, date: null, weekday: null, courseName: null, times: [], format: null, groups: [], everyone: [], notes: [], raw: line };
                parts.forEach(function (p) {
                    var d = o.tripItinDate ? o.tripItinDate(p, o.year) : null;
                    if (d && d.iso && !day.date && !clean(d.rest).replace(/[,.]/g, '')) { day.date = d.iso; return; }
                    var wd = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i.exec(p);
                    if (wd) { day.weekday = cap(wd[1]); return; }
                    var t = times(p);
                    var course = clean(p.replace(TIME, '').replace(/[,&]+/g, ' ').replace(/\b(and|at|tee times?)\b/ig, ' '));
                    if (t.length) day.times = day.times.concat(t);
                    if (course && !day.courseName) day.courseName = course;
                });
                plan.days.push(day);
                return;
            }
            if (inTeams || /^team\s+[^:]+:/i.test(line) && !day) {
                if ((m = /^([^:]+):\s*(.+)$/.exec(line))) {
                    var raw = m[2];
                    var captain = (/([A-Za-z' .-]+?)\s*\((?:captain|capt|c)\)/i.exec(raw) || [])[1] || null;
                    var t2 = { name: clean(m[1]), players: names(raw), captain: captain ? cap(captain.trim()) : null };
                    t2.players.forEach(addGolfer);
                    plan.teams.push(t2);
                    return;
                }
                inTeams = false;
            }
            if (!day && !plan.cup && /\b(ryder|cup)\b|\bvs\.?\b/i.test(line) && /team/i.test(line)) {
                var vs = /(team\s+[\w' ]+?|[\w' ]+?)\s+vs?\.?\s+(team\s+[\w' ]+?)(?=[.,;]|$)/i.exec(line);
                var pts = /(\d+(?:\.\d+)?)\s*points?\s*(?:per|a|for a)\s*(?:match\s*)?win/i.exec(line) || /(\d+(?:\.\d+)?)\s*points?\s*per\s*match/i.exec(line);
                var half = /(\.5|half|0\.5)\s*(?:a\s*)?(?:point\s*)?(?:for|per)\s*(?:a\s*)?halve/i.exec(line);
                var win = /first\s*to\s*(\d+(?:\.\d+)?)/i.exec(line) || /(\d+(?:\.\d+)?)\s*(?:points?\s*)?(?:to\s*)?wins?\s*the\s*cup/i.exec(line);
                plan.cup = {
                    style: /ryder/i.test(line) ? 'ryder' : 'team',
                    nameA: vs ? clean(vs[1]) : null, nameB: vs ? clean(vs[2]) : null,
                    pointsPerWin: pts ? +pts[1] : 1, halve: half ? 0.5 : (/halve/i.test(line) ? 0.5 : 0.5),
                    toWin: win ? +win[1] : null, raw: line
                };
                return;
            }
            if (day && (m = /^format\s*:\s*(.+)$/i.exec(line))) { day.format = readFormat(m[1]); return; }
            if (day && (m = /^group\s*(\d+)\s*(?:\(([^)]*)\))?\s*[:.-]?\s*(.*)$/i.exec(line))) {
                var body = m[3];
                var split = body.split(DASH);
                var left = split[0], right = split.slice(1).join(' - ');
                // No dash: the games start at the first "$".
                if (split.length === 1 && body.indexOf('$') !== -1) { left = body.slice(0, body.indexOf('$')).replace(/[,;]\s*$/, ''); right = body.slice(body.indexOf('$')); }
                var g = { n: +m[1], time: (times(m[2] || '')[0]) || day.times[+m[1] - 1] || null, matches: [], games: [], flags: [] };
                left.split(/\s*[,;]\s*(?=[^,;]*\bvs?\.?\b)/i).forEach(function (pair) {
                    var sides = pair.split(/\s+vs?\.?\s+/i);
                    if (sides.length === 2) {
                        var a = names(sides[0]), b = names(sides[1]);
                        a.concat(b).forEach(addGolfer);
                        g.matches.push({ a: a, b: b });
                    }
                });
                if (right) { var gg = games(right); g.games = gg.games; g.flags = gg.flags; }
                day.groups.push(g);
                return;
            }
            if (day && (m = /^(?:everyone|all|whole group|field)\s*:\s*(.+)$/i.exec(line))) {
                var eg = games(m[1]);
                var kp = /\$\s?(\d+(?:\.\d+)?)\s*(?:kp|closest(?:\s*to\s*(?:the\s*)?pin)?|ctp)\b(.*)$/i.exec(m[1]) || /\b(?:kp|ctp|closest to (?:the )?pin)\b.*?\$\s?(\d+(?:\.\d+)?)/i.exec(m[1]);
                if (kp) eg.games.push({ type: 'kp', label: 'KP', amount: +kp[1], par3s: /par\s*3/i.test(m[1]), raw: m[1] });
                day.everyone = day.everyone.concat(eg.games.map(function (x) { x.everyone = true; x.line = m[1]; return x; }));
                if (!eg.games.length) day.notes.push(line);
                return;
            }
            // Anything else is kept as a note - never dropped.
            plan.notes.push({ text: line, day: day ? day.n : null });
        });
        if (!plan.name && plan.cup) plan.name = plan.cup.nameA && plan.cup.nameB ? plan.cup.nameA + ' v ' + plan.cup.nameB : 'Trip';
        return plan;
    }

    // ---- THE QUESTIONS (likely answer picked) ---------------------------------
    // Each: { id, day?, text, options: [{ v, label }], answer }
    function questions(plan, loops) {
        var q = [];
        var add = function (id, text, options, answer, day) { q.push({ id: id, day: day || null, text: text, options: options, answer: answer }); };
        var cup = plan.cup;
        if (cup) {
            if (cup.pointsPerWin !== 1) add('cup-points', 'The app’s Cup scores 1 point a match win (½ a halve). You wrote ' + cup.pointsPerWin + '.',
                [{ v: 'one', label: 'Use 1 point a match (note yours on the trip)' }, { v: 'note', label: 'Same, and I’ll keep score by hand' }], 'one');
            if (cup.toWin != null) add('cup-towin', '"First to ' + fmtPts(cup.toWin) + '" is kept on the trip page. The Cup card shows the points, not the target yet.',
                [{ v: 'ok', label: 'OK' }], 'ok');
            add('cup-scoring', 'Cup matches: with handicaps or gross?', [{ v: 'net', label: 'With handicaps (net)' }, { v: 'gross', label: 'Gross' }], 'net');
            var sideNames = plan.teams.map(function (t) { return t.name; });
            if (plan.teams.length !== 2) add('cup-teams', 'I need exactly two teams for the Cup (found ' + plan.teams.length + ').', [{ v: 'fix', label: 'I’ll fix the teams below' }], 'fix');
            else if (cup.nameA && sideNames.map(key).indexOf(key(cup.nameA)) === -1) add('cup-names', 'The Cup line says ' + cup.nameA + ' v ' + cup.nameB + '; the teams are ' + sideNames.join(' and ') + '.',
                [{ v: 'teams', label: 'Use ' + sideNames.join(' v ') }], 'teams');
        }
        var onTeam = {};
        plan.teams.forEach(function (t) { t.players.forEach(function (p) { onTeam[key(p)] = t.name; }); });
        plan.days.forEach(function (d) {
            if (!d.date) add('date-' + d.n, 'Day ' + d.n + ' has no date I could read.', [{ v: 'later', label: 'I’ll type it below' }], 'later', d.n);
            var lp = d.courseKey && loops && loops[d.courseKey];
            if (lp && Object.keys(lp).length > 2) {
                var ks = Object.keys(lp), pairs = [];
                ks.forEach(function (a) { ks.forEach(function (b) { if (a !== b) pairs.push({ v: a + '|' + b, label: lp[a].name + ' then ' + lp[b].name }); }); });
                add('nines-' + d.n, 'Day ' + d.n + ': ' + (d.courseName || 'this course') + ' has ' + ks.length + ' nines — which two, in order?', pairs, pairs[0].v, d.n);
            }
            if (!d.courseKey) add('course-' + d.n, 'Day ' + d.n + ': "' + (d.courseName || '?') + '" is not a saved course.', [{ v: 'later', label: 'Set the course later in Round Setup (the round is made without a card)' }], 'later', d.n);
            var f = d.format;
            if (cup && !f) add('fmt-' + d.n, 'Day ' + d.n + ' has no "Format:" line.', [{ v: 'none', label: 'No Cup matches this day' }, { v: 'fourball', label: 'Four-ball' }, { v: 'foursomes', label: 'Foursomes' }, { v: 'singles', label: 'Singles' }], 'none', d.n);
            if (cup && f) {
                if (f.type === 'scramble' || !f.type) add('fmt-' + d.n, 'Day ' + d.n + ': "' + f.raw + '" is not a Cup format (four-ball, foursomes, singles).', [{ v: 'none', label: 'No Cup matches this day' }, { v: 'fourball', label: 'Count it as four-ball' }], 'none', d.n);
                if (f.points && f.points !== 1) add('pts-' + d.n, 'Day ' + d.n + ': ' + f.points + ' points per match' + (f.nines ? ' (front 9 + back 9)' : '') + ' — the app’s Cup counts 1 a match and can’t split the nines yet.',
                    [{ v: 'one', label: 'Count 1 point per match; note the 2-point rule on the trip' }], 'one', d.n);
            }
            d.groups.forEach(function (g) {
                var all = [];
                g.matches.forEach(function (m) { all = all.concat(m.a, m.b); });
                all.forEach(function (p) {
                    if (cup && plan.teams.length === 2 && !onTeam[key(p)]) add('who-' + d.n + '-' + key(p), 'Day ' + d.n + ' Group ' + g.n + ': ' + p + ' is not on a team.', [{ v: 'skip', label: 'Leave ' + p + ' out of the Cup' }], 'skip', d.n);
                });
                g.matches.forEach(function (m, i) {
                    if (cup && plan.teams.length === 2 && m.a.length && m.b.length && onTeam[key(m.a[0])] && onTeam[key(m.a[0])] === onTeam[key(m.b[0])])
                        add('same-' + d.n + '-' + g.n + '-' + i, 'Day ' + d.n + ' Group ' + g.n + ': ' + m.a.join(' & ') + ' v ' + m.b.join(' & ') + ' are on the same team.', [{ v: 'nocup', label: 'Play it, but not for Cup points' }], 'nocup', d.n);
                });
                g.games.forEach(function (x) {
                    if (x.type === 'nassau' && !q.some(function (y) { return y.id === 'press-' + d.n + '-' + g.n; })) { add('press-' + d.n + '-' + g.n, 'Day ' + d.n + ' Group ' + g.n + ' Nassau: presses?', [{ v: 'none', label: 'No presses' }, { v: '2down', label: 'Auto press at 2 down' }, { v: 'anytime', label: 'Press any hole' }], x.press === 'auto' ? '2down' : x.press === 'manual' ? 'anytime' : 'none', d.n); }
                    if (x.type === 'vegas' && !(g.matches.length === 1 && g.matches[0].a.length === 2 && g.matches[0].b.length === 2))
                        add('vegas-' + d.n + '-' + g.n, 'Day ' + d.n + ' Group ' + g.n + ': Vegas needs two teams of two.', [{ v: 'skip', label: 'Leave Vegas out' }], 'skip', d.n);
                    if (['nassau', 'vegas', 'bbb', 'skins'].indexOf(x.type) === -1) add('game-' + d.n + '-' + g.n + '-' + x.type, 'Day ' + d.n + ' Group ' + g.n + ': "' + x.label + '" isn’t set up by the builder.', [{ v: 'later', label: 'Add it later in Round Setup' }], 'later', d.n);
                });
                (g.flags || []).forEach(function (fl, i) { add('flag-' + d.n + '-' + g.n + '-' + i, 'Day ' + d.n + ' Group ' + g.n + ': ' + fl.why + ' ("' + fl.text + '")', [{ v: 'later', label: 'Leave it out (kept as a note)' }], 'later', d.n); });
            });
            d.everyone.forEach(function (x) {
                if (x.type === 'skins') add('carry-' + d.n, 'Day ' + d.n + ' everyone skins: carry over ties?', [{ v: 'yes', label: 'Carry over' }, { v: 'no', label: 'No carry' }], x.carry === false ? 'no' : 'yes', d.n);
                if (x.type === 'nassau') add('evnassau-' + d.n, 'Day ' + d.n + ': "' + x.raw + '" for everyone — a $' + x.front + ' Nassau in each match (' + d.groups.map(function (g) { return g.matches.map(function (m) { return m.a.join(' & ') + ' v ' + m.b.join(' & '); }).join(', '); }).join(', ') + ')?',
                    [{ v: 'permatch', label: 'Yes, one Nassau per match' }, { v: 'skip', label: 'Leave it out' }], 'permatch', d.n);
                if (x.type === 'kp') add('kp-' + d.n, 'Day ' + d.n + ': "$' + x.amount + ' KP' + (x.par3s ? ' on the par 3s' : '') + '" — KP on every par 3; how is it paid?',
                    [{ v: 'buyin', label: 'Each golfer puts in $' + x.amount + '; the pot is split over the par 3s' }, { v: 'perhole', label: '$' + x.amount + ' per par 3, the pot shared by everyone' }, { v: 'skip', label: 'Leave KP out' }], 'buyin', d.n);
                if (['skins', 'kp', 'nassau'].indexOf(x.type) === -1) add('ev-' + d.n + '-' + x.type, 'Day ' + d.n + ' everyone: "' + x.label + '" isn’t set up by the builder.', [{ v: 'later', label: 'Add it later in Round Setup' }], 'later', d.n);
            });
        });
        add('hcp', 'No handicaps in the paste. Matches and Nassaus are net.', [{ v: 'enter', label: 'Type them in below (blank = 0)' }, { v: 'later', label: 'Later, on each round’s Players step' }], 'enter');
        return q;
    }
    function fmtPts(x) { return x % 1 ? Math.floor(x) + '½' : String(x); }
    function answer(qs, id, dflt) { var x = (qs || []).filter(function (q) { return q.id === id; })[0]; return x ? x.answer : dflt; }

    // ---- THE WRITES -------------------------------------------------------------
    // ctx: { tripCode, roundCodes: [per day], uid, now, tokens: { trip, rounds: [] }, courseFor(day) -> { courseData, courseName, courseKey },
    //        pushKey() -> unique id, sideMatchPayloadFromTerms, buildRyderCupConfig, validateMoneyPool, hcps: { name: '9' } }
    function build(plan, qs, ctx) {
        var c = ctx || {};
        var cup = plan.cup && plan.teams.length === 2 ? plan.cup : null;
        // ONE player list for every round, so the Cup's ids mean the same golfer on
        // every day (ryder-cup.js translates by name too, but ids agreeing is simpler).
        var order = plan.golfers.slice();
        var idOf = {};
        order.forEach(function (n, i) { idOf[key(n)] = String(101 + i); });
        var sideOf = {};
        if (cup) plan.teams.forEach(function (t, i) { t.players.forEach(function (p) { sideOf[key(p)] = i === 0 ? 'A' : 'B'; }); });
        var ids = function (list) { return (list || []).map(function (n) { return idOf[key(n)]; }).filter(Boolean); };
        var hcp = function (n) { var v = c.hcps && c.hcps[key(n)]; return v == null || v === '' ? '0' : String(v); };
        var updates = {}, rounds = [], problems = [];
        var cupScoring = answer(qs, 'cup-scoring', 'net');
        var cupMatches = [], sessions = {};

        plan.days.forEach(function (d, di) {
            var code = c.roundCodes[di];
            var course = (c.courseFor && c.courseFor(d)) || {};
            // Golfers in group order: group 1's four, then group 2's...
            var inGroups = [];
            d.groups.forEach(function (g) { g.matches.forEach(function (m) { m.a.concat(m.b).forEach(function (n) { if (inGroups.indexOf(key(n)) === -1) inGroups.push(key(n)); }); }); });
            order.forEach(function (n) { if (inGroups.indexOf(key(n)) === -1) inGroups.push(key(n)); });
            var byKey = {};
            order.forEach(function (n) { byKey[key(n)] = n; });
            var players = inGroups.map(function (k) { return { id: Number(idOf[k]), name: byKey[k], hcp: hcp(byKey[k]), team: 'Team 1', squad: 'red', playingForMoney: true }; });
            var sizes = d.groups.map(function (g) { var s = {}; g.matches.forEach(function (m) { m.a.concat(m.b).forEach(function (n) { s[key(n)] = 1; }); }); return Object.keys(s).length; }).filter(Boolean);
            var placed = sizes.reduce(function (a, b) { return a + b; }, 0);
            if (placed < players.length) sizes.push(players.length - placed);
            var gso = {};
            sizes.forEach(function (s, i) { gso[i] = s; });
            var multi = sizes.length > 1;
            var groupIds = d.groups.map(function (g) { var s = []; g.matches.forEach(function (m) { s = s.concat(ids(m.a), ids(m.b)); }); return s; });

            var sideMatches = {}, inst = {}, pool = null;
            d.groups.forEach(function (g, gi) {
                var scope = multi ? { scope: 'group', ownerGroup: gi + 1 } : {};
                g.games.forEach(function (x) {
                    if (x.type === 'nassau') {
                        g.matches.forEach(function (m) {
                            var p = c.sideMatchPayloadFromTerms({ format: 'nassau', scoring: cupScoring === 'gross' ? 'gross' : 'net', frontStake: x.front, backStake: x.back, overallStake: x.overall,
                                pressRule: answer(qs, 'press-' + d.n + '-' + g.n, 'none'), autoPressStake: null },
                                { teamAIds: ids(m.a), teamBIds: ids(m.b), startHole: 1, now: c.now, scope: scope.scope || null, ownerGroup: scope.scope ? scope.ownerGroup : null });
                            sideMatches[c.pushKey()] = p;
                        });
                    } else if (x.type === 'vegas') {
                        if (answer(qs, 'vegas-' + d.n + '-' + g.n, null) === 'skip') return;
                        var m0 = g.matches[0];
                        inst[c.pushKey()] = { format: 'vegas', enabled: true, startHole: 1, createdAt: c.now, vegasPointVal: x.perPoint == null ? 1 : x.perPoint, vegasBirdieFlip: !!x.flip,
                            vegasTeamA: ids(m0.a), vegasTeamB: ids(m0.b), participantIds: ids(m0.a).concat(ids(m0.b)) };
                    } else if (x.type === 'bbb') {
                        inst[c.pushKey()] = { format: 'bbb', enabled: true, startHole: 1, createdAt: c.now, bbbPointVal: x.perPoint == null ? 1 : x.perPoint, participantIds: groupIds[gi] };
                    } else if (x.type === 'skins') {
                        var e = { format: 'skins', enabled: true, skinsBuyIn: x.amount == null ? 0 : x.amount, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: x.carry !== false, startHole: 1 };
                        if (groupIds[gi].length < players.length) e.participantIds = groupIds[gi];
                        if (scope.scope) { e.scope = 'group'; e.ownerGroup = scope.ownerGroup; }
                        inst[c.pushKey()] = e;
                    }
                });
            });
            d.everyone.forEach(function (x) {
                if (x.type === 'nassau') {
                    if (answer(qs, 'evnassau-' + d.n, 'permatch') !== 'permatch') return;
                    d.groups.forEach(function (g, gi) {
                        g.matches.forEach(function (m) {
                            sideMatches[c.pushKey()] = c.sideMatchPayloadFromTerms({ format: 'nassau', scoring: cupScoring === 'gross' ? 'gross' : 'net', frontStake: x.front, backStake: x.back, overallStake: x.overall,
                                pressRule: x.press === 'auto' ? '2down' : x.press === 'manual' ? 'anytime' : 'none', autoPressStake: null },
                                { teamAIds: ids(m.a), teamBIds: ids(m.b), startHole: 1, now: c.now, scope: multi ? 'group' : null, ownerGroup: multi ? gi + 1 : null });
                        });
                    });
                    return;
                }
                if (x.type === 'skins') {
                    var net = /\bnet\b/i.test(x.line || x.raw || '');
                    inst[c.pushKey()] = { format: 'skins', enabled: true, skinsBuyIn: x.amount == null ? 0 : x.amount, skinsPotFormat: net ? 'net' : 'gross', skinsScoring: net ? 'net' : 'gross',
                        skinsCarryOver: answer(qs, 'carry-' + d.n, 'yes') !== 'no', startHole: 1 };
                } else if (x.type === 'kp') {
                    var how = answer(qs, 'kp-' + d.n, 'buyin');
                    var par3 = (course.courseData || []).filter(function (h) { return Number(h.par) === 3; }).map(function (h) { return Number(h.hole); });
                    if (how === 'skip') return;
                    if (!par3.length) { problems.push('Day ' + d.n + ': no par 3s on the card, so KP was left out.'); return; }
                    var potAmt = how === 'perhole' ? x.amount * par3.length : x.amount * players.length;
                    var buyIn = potAmt / players.length;
                    pool = { enabled: true, buyIn: buyIn, kp: { amount: potAmt, holes: par3 }, skins: { mode: 'none', scoring: 'gross', carryOver: true } };
                }
            });

            var wdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            var when = d.date ? (function (x) { return wdays[x.getDay()] + ' ' + (x.getMonth() + 1) + '/' + x.getDate(); })(new Date(d.date + 'T12:00:00')) : d.weekday;
            var label = 'Day ' + d.n + (when ? ' · ' + when : '') + (course.courseName || d.courseName ? ' · ' + (course.courseName || d.courseName) : '');
            var ev = {
                eventName: label, roundDay: label, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar',
                organizerToken: c.tokens.rounds[di], eventCategory: 'weekend', categoryIcon: '⛳',
                activeCourseKey: course.courseKey || null, courseName: course.courseName || d.courseName || null, gameFormat: 'stroke', holeBetStake: 0,
                additionalGames: {}, additionalGameInstances: inst, birdieGameEnabled: false, birdieUnitVal: 0,
                matchScoring: 'net', matchScoringStyle: 'match', matchStake: 0, matchPressRule: 'none',
                nassauType: 'team', nassauScoring: 'net', nassauStake: 0, nassauPressRule: 'none',
                wolfPointVal: 0, wolfLoneMult: 2, wolfBlindMult: 3, wolfTieRule: 'carry', wolfLastPlaceRule: 'off',
                stablefordPointVal: 0, groupSizeOverrides: gso, stablefordScoring: 'net',
                stablefordPoints: { other: 0, bogey: 1, par: 2, birdie: 3, eagle: 4, albatross: 5 },
                dotPointVal: 0, greenieCarryover: true, skinsBuyIn: 0, skinsCarryOver: false,
                courseData: course.courseData || null, startingHole: 1,
                teeRating: { teeKey: '', teeName: '', slope: null, courseRating: null, par: null, allowance: 100 },
                alohaAllowed: false, handicapBasis: 'as-entered', players: players,
                ownerUid: c.uid
            };
            if (pool) {
                ev.moneyPool = pool;
                var v = c.validateMoneyPool ? c.validateMoneyPool(ev, course.courseData || []) : { valid: true };
                if (!v.valid) { problems.push('Day ' + d.n + ' KP: ' + v.errors.join('; ')); delete ev.moneyPool; }
            }
            if (Object.keys(sideMatches).length) ev.sideMatches = sideMatches;
            Object.keys(ev).forEach(function (k) { if (ev[k] === null) delete ev[k]; });

            // THE CUP: this day's matches, in its own session.
            var f = d.format;
            var pickFmt = answer(qs, 'fmt-' + d.n, 'none');
            var fmt = f && f.type && f.type !== 'scramble' ? f.type : (pickFmt !== 'none' ? pickFmt : null);
            if (cup && fmt) {
                var sid = 'd' + d.n + 's1';
                sessions[sid] = { id: sid, day: d.n, order: d.n, format: fmt, label: 'Day ' + d.n + ' · ' + (FORMATS.filter(function (x) { return x.type === fmt; })[0] || {}).label };
                d.groups.forEach(function (g, gi) {
                    g.matches.forEach(function (m, mi) {
                        if (answer(qs, 'same-' + d.n + '-' + g.n + '-' + mi, null) === 'nocup') return;
                        var a = ids(m.a.filter(function (n) { return sideOf[key(n)]; })), b = ids(m.b.filter(function (n) { return sideOf[key(n)]; }));
                        if (!a.length || !b.length) return;
                        // Side A of the Cup is the first team, whichever side of "vs" it was typed on.
                        if (sideOf[key(m.a[0])] === 'B') { var t = a; a = b; b = t; }
                        cupMatches.push({ id: 'd' + d.n + 'g' + g.n + 'm' + (mi + 1), sessionId: sid, format: fmt,
                            scoring: fmt === 'foursomes' ? (cupScoring === 'gross' ? 'scratch' : 'handicap') : cupScoring, playersA: a, playersB: b });
                    });
                });
                ev.ryderCupRef = { host: c.roundCodes[0], sessionId: sid };
            }
            updates['events/' + code] = ev;
            updates['trips/' + c.tripCode + '/rounds/' + code] = Object.assign({ label: label, addedAt: c.now + di }, d.date ? { date: d.date } : {}, d.times[0] ? { time: d.times[0] } : {});
            rounds.push({ code: code, label: label, day: d.n });
        });

        if (cup && cupMatches.length) {
            var members = {};
            Object.keys(sideOf).forEach(function (k) { if (idOf[k]) members[idOf[k]] = sideOf[k]; });
            var cfg = c.buildRyderCupConfig({ name: plan.name || 'Cup', nameA: plan.teams[0].name, nameB: plan.teams[1].name, members: members, matches: cupMatches });
            cfg.sessions = sessions;
            var host = updates['events/' + c.roundCodes[0]];
            host.ryderCup = cfg;
            if (!host.ryderCupRef) host.ryderCupRef = { host: c.roundCodes[0] };
            if (c.validateRyderCupSave) {
                var pr = c.validateRyderCupSave({ players: host.players }, host.courseData || [], {}, cfg);
                pr.forEach(function (p) { problems.push('Cup: ' + p.message); });
            }
        }

        updates['trips/' + c.tripCode + '/name'] = plan.name || 'Trip';
        updates['trips/' + c.tripCode + '/createdAt'] = c.now;
        updates['trips/' + c.tripCode + '/organizerToken'] = c.tokens.trip;
        // WHAT THE ENGINE CAN'T HOLD, kept on the trip: the Cup's own rules, captains,
        // and every line the builder did not turn into setup.
        updates['trips/' + c.tripCode + '/builder'] = {
            v: 1, at: c.now,
            cup: cup ? { name: plan.name || null, teams: plan.teams.map(function (t) { return { name: t.name, captain: t.captain || null, players: t.players }; }),
                pointsPerWin: cup.pointsPerWin, halve: cup.halve, toWin: cup.toWin,
                days: plan.days.map(function (d) { return { day: d.n, format: d.format ? d.format.raw : null, points: d.format && d.format.points || 1, nines: !!(d.format && d.format.nines) }; }) } : null,
            notes: plan.notes.map(function (n) { return (n.day ? 'Day ' + n.day + ': ' : '') + n.text; })
                .concat([].concat.apply([], plan.days.map(function (d) { return d.notes.map(function (t) { return 'Day ' + d.n + ': ' + t; }); })))
        };
        return { updates: updates, rounds: rounds, problems: problems };
    }

    // Attach saved courses to the plan's days (tripItinMatch against the known list).
    function matchCourses(plan, known, match) {
        plan.days.forEach(function (d) { d.courseKey = d.courseName && match ? match(d.courseName, known || {}) : null; });
        return plan;
    }

    var api = { parseTrip: parseTrip, questions: questions, build: build, matchCourses: matchCourses, readFormat: readFormat, times: times, names: names, fmtPts: fmtPts };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.HardPanTripBuilder = api;
})(typeof window !== 'undefined' ? window : this);
