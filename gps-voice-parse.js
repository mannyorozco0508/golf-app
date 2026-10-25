// ============================================================================
// HARDPAN GPS - VOICE SCORING: THE WORDS -> A SCORE (URGENT-066 feature 4). PURE.
//
// One deterministic grammar for both ways in: the in-app push-to-talk button (Apple's
// on-device speech recognizer, gps-voice.js) and Siri / AirPods (the App Intents, through
// the same bridge). No AI, no guessing, no network, no position: plain words in, and either
// ONE score to confirm or ONE question back.
//
//   parse(text, ctx) -> one of
//     { kind: 'score', golfer: { id, name }, hole, strokes, putts (null when not said), rel, said }
//     { kind: 'yardage' }     "what's my yardage", "how far", "distance to the green"
//     { kind: 'cancel' }      "cancel", "never mind"
//     { kind: 'ask', reason, ask, choices? }   NOT SURE: the question to ask, never a guess
//   ctx: { hole, par, golfers: [{ id, name }], me (id or null), prev: { [id]: strokes on the hole before },
//          holes (the hole numbers this round has; default 1-18) }
//
// What it understands: digits and number words ("five", "a 5"), golf words relative to the
// hole's par (par, birdie, bogey, double / triple bogey, eagle, albatross, "one over", "two under",
// "parred", "bogeyed", "hole in one"), putts ("two putts", "2-putt", "three jack", "no putts",
// "chipped in"), a golfer ("for Mike", "Mike got a 5", "Mike's 5", "me" / "I" / nobody = this
// phone's golfer), a hole ("on 7", "hole 7", "on the 7th") and "same as last hole".
// It ASKS when: nothing to score, two different numbers for the score, a golf word with no par,
// a golf word and a number that disagree, more putts than the score allows, a hedge ("maybe",
// "or", "I think", "not a", "actually"), a name it does not know, two golfers with that name,
// two golfers in one sentence, no golfer it can be sure of, or a hole the round does not have.
// ============================================================================
(function () {
    'use strict';

    var UNITS = { zero: 0, oh: null, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
    var ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
        eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18 };
    // "for", "to", "too", "won", "ate" are NEVER numbers: "put me down FOR a 5", "for Mike".
    var MAX_STROKES = 20, MAX_PUTTS = 9;
    var SELF = { i: 1, me: 1, my: 1, myself: 1, mine: 1, "i'm": 1, "i've": 1 };
    var OTHERS = { him: 1, her: 1, them: 1, we: 1, us: 1, everyone: 1, everybody: 1, all: 1, both: 1, "y'all": 1, he: 1, she: 1, they: 1 };
    var HEDGE = /\b(maybe|or|i think|i guess|probably|not sure|either|wait|actually|scratch that|not a|not an|no wait|no no|undo|change it|instead|kind of|sort of|about|around|roughly|something like)\b/;
    // Words this grammar uses or that are everyday words: a golfer called one of these is matched
    // only with a clear marker ("for Chip", "Chip got", "Chip's"), never as a stray word.
    var COMMON = { will: 1, may: 1, chip: 1, jack: 1, ace: 1, pat: 1, bill: 1, mark: 1, art: 1, rich: 1, dean: 1, grant: 1, hunter: 1, chase: 1,
        drew: 1, frank: 1, guy: 1, joy: 1, hope: 1, june: 1, max: 1, miles: 1, sky: 1, sunny: 1, sonny: 1, earl: 1, eagle: 1, birdie: 1, par: 1,
        bogey: 1, long: 1, young: 1, little: 1, king: 1, green: 1, white: 1, brown: 1, black: 1, gray: 1, grey: 1, wood: 1, woods: 1, page: 1,
        down: 1, put: 1, me: 1, i: 1, a: 1, an: 1, for: 1, the: 1, on: 1, hole: 1, putt: 1, putts: 1, same: 1, last: 1, even: 1, double: 1, triple: 1,
        rob: 1, sean: 1, shawn: 1, ray: 1, rose: 1, lee: 1, love: 1, cash: 1, price: 1, nick: 1, sandy: 1, scott: 1, one: 1, two: 1, three: 1, four: 1, five: 1, six: 1, seven: 1, eight: 1, nine: 1, ten: 1 };
    var NAME_BEFORE = { for: 1, give: 1, put: 1, mark: 1, write: 1, record: 1 };
    var NAME_AFTER = { got: 1, gets: 1, made: 1, makes: 1, had: 1, has: 1, shot: 1, shoots: 1, scored: 1, carded: 1, is: 1, was: 1, takes: 1, took: 1,
        parred: 1, birdied: 1, bogeyed: 1, eagled: 1, doubled: 1, tripled: 1 };
    // After "for" these are not names: "for a 5", "for par", "for hole 7".
    var NOT_NAME = { a: 1, an: 1, the: 1, me: 1, my: 1, myself: 1, him: 1, her: 1, us: 1, them: 1, hole: 1, par: 1, birdie: 1, bogey: 1, eagle: 1,
        double: 1, triple: 1, this: 1, that: 1, it: 1, now: 1, today: 1, number: 1, quad: 1, albatross: 1, real: 1, sure: 1, two: 1, putts: 1, putt: 1,
        everyone: 1, everybody: 1, all: 1, both: 1, you: 1, same: 1, last: 1, ace: 1, even: 1, one: 1, under: 1, over: 1, net: 1, gross: 1,
        bogie: 1, bogy: 1, birdy: 1, eagles: 1, birdies: 1, bogeys: 1, quadruple: 1, score: 1, "it's": 1, its: 1, yourself: 1 };
    var NOT_LEAD = /^(put|give|mark|write|record|he|she|they|it|that|this|what|just|we|finally|then|so|and|also|ok|okay|hey|siri|yeah|yes|well|um|uh|you|who|everyone|everybody|someone|somebody|nobody)$/;

    function norm(text) {
        return String(text == null ? '' : text).toLowerCase()
            .replace(/[‘’ʼ`]/g, "'")
            .replace(/[–—-]/g, ' ')
            .replace(/(\d)(st|nd|rd|th)\b/g, '$1 th')
            .replace(/([a-z])\.(?=\s|$)/g, '$1')
            .replace(/[^a-z0-9'+ ]+/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }
    function numOf(tok) {
        if (tok == null) return null;
        if (/^\d+$/.test(tok)) return Number(tok);
        return Object.prototype.hasOwnProperty.call(UNITS, tok) ? UNITS[tok] : null;
    }
    function ordOf(tok) { return Object.prototype.hasOwnProperty.call(ORDINALS, tok) ? ORDINALS[tok] : null; }
    function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
    function relName(d) {
        return { '-4': 'condor', '-3': 'albatross', '-2': 'eagle', '-1': 'birdie', '0': 'par', '1': 'bogey', '2': 'double bogey', '3': 'triple bogey' }[String(d)] || (d > 0 ? '+' + d : String(d));
    }
    function ask(reason, q, extra) { var o = { kind: 'ask', reason: reason, ask: q }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
    function nameTokens(name) { return norm(name).split(' ').filter(Boolean).map(function (t) { return t.replace(/'s$/, ''); }); }

    // ---- the golfers named in the words --------------------------------------------------
    function findGolfers(toks, golfers) {
        var found = [], used = {}, firstCount = {};
        golfers.forEach(function (g) { var f = nameTokens(g.name)[0]; if (f) firstCount[f] = (firstCount[f] || 0) + 1; });
        var plain = toks.map(function (t) { return t.replace(/'s$/, ''); });
        var marked = function (i, len) {
            var before = plain[i - 1], after = toks[i + len - 1], next = plain[i + len];
            return !!(NAME_BEFORE[before] || /'s$/.test(after) || NAME_AFTER[next] || (i === 0 && next != null && (numOf(next) != null || /^(par|birdie|bogey|eagle|double|triple)$/.test(next))));
        };
        // Full names first ("Mike Smith"), then first or last names.
        golfers.forEach(function (g) {
            var nt = nameTokens(g.name);
            if (nt.length < 2) return;
            for (var i = 0; i + nt.length <= plain.length; i++) {
                var hit = true;
                for (var k = 0; k < nt.length; k++) if (plain[i + k] !== nt[k]) { hit = false; break; }
                if (hit) { found.push({ g: g, at: i, len: nt.length, full: true }); for (var u = 0; u < nt.length; u++) used[i + u] = 1; }
            }
        });
        var partial = {};
        plain.forEach(function (t, i) {
            if (used[i] || !t) return;
            var hits = golfers.filter(function (g) { var nt = nameTokens(g.name); return nt.indexOf(t) !== -1; });
            if (!hits.length) return;
            if (COMMON[t] && !marked(i, 1)) return;
            partial[i] = hits;
        });
        return { full: found, partial: partial, firstCount: firstCount };
    }

    function parse(text, ctx) {
        ctx = ctx || {};
        var golfers = (ctx.golfers || []).filter(function (g) { return g && g.id != null && String(g.name || '').trim(); });
        var said = norm(text);
        if (!said) return ask('empty', 'I didn’t catch that. Say a score, like “a 5, two putts”.');
        if (/^(cancel|never ?mind|forget it|stop|no|nope|quit|close)( it| that)?$/.test(said)) return { kind: 'cancel' };
        var hasScoreWord = /\b(\d+|par|birdie|bogey|bogie|eagle|albatross|putt|putts|putted|score|ace|double|triple)\b/.test(said) || /\bput (me|\w+) down\b/.test(said);
        if (/\b(yardage|yardages|how far|distance|how many yards|what do i have|whats? left)\b/.test(said) && !/\b(putt|putts|bogey|birdie|eagle|par)\b/.test(said)) return { kind: 'yardage' };
        if (HEDGE.test(said)) return ask('hedge', 'I want to get it right — say just the one score, like “a 5, two putts”.');

        var toks = said.split(' ');
        var gone = {};   // tokens already used
        var take = function (i, n) { for (var k = 0; k < (n || 1); k++) gone[i + k] = 1; };

        // ---- the hole: "on 7", "hole 7", "on hole 7", "on the 7th", "the seventh" ------------------
        var hole = null, holeSaid = false;
        for (var i = 0; i < toks.length; i++) {
            var t = toks[i], n1 = toks[i + 1], n2 = toks[i + 2];
            var h = null, len = 0;
            if ((t === 'hole' || t === 'number') && numOf(n1) != null) { h = numOf(n1); len = 2; if (i > 0 && (toks[i - 1] === 'on' || toks[i - 1] === 'for')) { i--; len = 3; } }
            else if (t === 'on' && numOf(n1) != null && toks[i + 2] !== 'putt' && toks[i + 2] !== 'putts') { h = numOf(n1); len = 2; if (n2 === 'th') len = 3; }
            else if (t === 'on' && n1 === 'the' && (ordOf(n2) != null || (numOf(n2) != null && toks[i + 3] === 'th'))) { h = ordOf(n2) != null ? ordOf(n2) : numOf(n2); len = ordOf(n2) != null ? 3 : 4; if (toks[i + len] === 'hole') len++; }
            else if (t === 'the' && ordOf(n1) != null) { h = ordOf(n1); len = 2; if (n2 === 'hole') len = 3; }
            else if (numOf(t) != null && n1 === 'th') { h = numOf(t); len = 2; if (n2 === 'hole') len = 3; }
            if (h != null) {
                if (holeSaid && h !== hole) return ask('two-holes', 'Which hole is it for? Say one hole.');
                hole = h; holeSaid = true; take(i, len); i += len - 1;
            }
        }
        var holes = Array.isArray(ctx.holes) && ctx.holes.length ? ctx.holes.map(Number) : null;
        if (holeSaid && (!(hole >= 1 && hole <= 36) || (holes && holes.indexOf(hole) === -1))) return ask('hole-range', 'This round has no hole ' + hole + '. Which hole?');
        if (!holeSaid) hole = ctx.hole != null ? Number(ctx.hole) : null;
        if (!(hole >= 1)) return ask('which-hole', 'Which hole is this for?');
        var par = holeSaid && ctx.parOf ? Number(ctx.parOf(hole)) || null : (holeSaid && hole !== Number(ctx.hole) ? null : (Number(ctx.par) || null));

        // ---- putts: "two putts", "2 putt", "two putted", "three jack", "no putts", "chipped in" -------
        var putts = null, puttsSaid = 0, puttWord = false;
        for (i = 0; i < toks.length; i++) {
            if (gone[i]) continue;
            t = toks[i];
            var isPuttWord = /^(putt|putts|putted|putting|jack|jacked|jacks)$/.test(t);
            if (!isPuttWord) continue;
            if (/^jack/.test(t) && numOf(toks[i - 1]) == null) continue;   // a golfer called Jack
            puttWord = true;
            var p = null, at = i - 1;
            if (toks[at] === 'a' && numOf(toks[at - 1]) == null) at = -1;   // "a putt" = 1? never guessed
            if (at >= 0 && !gone[at] && numOf(toks[at]) != null) p = numOf(toks[at]);
            else if (at >= 0 && (toks[at] === 'no' || toks[at] === 'zero')) p = 0;
            else if (numOf(toks[i + 1]) != null && !/^(putt|putts)$/.test(toks[i + 2] || '')) { p = numOf(toks[i + 1]); at = i + 1; }
            if (p == null) continue;
            puttsSaid++;
            if (putts != null && putts !== p) return ask('two-putts', 'How many putts? Say it once.');
            putts = p; take(i); if (at >= 0) take(at);
        }
        if (/\b(chipped in|chip in|holed out|jarred it)\b/.test(said)) {
            if (putts != null && putts !== 0) return ask('two-putts', 'Chipped in and ' + putts + ' putts? Say it again.');
            putts = 0; puttsSaid++; puttWord = true;
            toks.forEach(function (x, k) { if (/^(chipped|chip|holed|jarred|in|out|it)$/.test(x)) gone[k] = 1; });
        }
        if (puttWord && putts == null) return ask('putts-number', 'How many putts? Say the score and the putts, like “a 5, two putts”.');
        if (putts != null && putts > MAX_PUTTS) {
            var m = String(putts).match(/^(\d)(\d)$/);
            return ask('putts-range', m ? 'Did you mean a ' + m[1] + ' with ' + m[2] + ' putts? Say it again with a pause.' : putts + ' putts? Say it again.');
        }

        // ---- golf words, relative to par ----------------------------------------------------
        var rels = [];
        var relAdd = function (d, at, len) { rels.push(d); take(at, len); };
        for (i = 0; i < toks.length; i++) {
            if (gone[i]) continue;
            t = toks[i]; n1 = toks[i + 1];
            if (t === 'hole' && n1 === 'in' && toks[i + 2] === 'one') { rels.push('ace'); take(i, 3); i += 2; continue; }
            if (t === 'ace' || t === 'aced') { rels.push('ace'); take(i); continue; }
            if (t === 'double' && n1 === 'eagle') { relAdd(-3, i, 2); i++; continue; }
            if (t === 'albatross') { relAdd(-3, i, 1); continue; }
            if (t === 'eagle' || t === 'eagled') { relAdd(-2, i, 1); continue; }
            if (t === 'birdie' || t === 'birdied' || t === 'birdy') { relAdd(-1, i, 1); continue; }
            if ((t === 'double' || t === 'triple' || t === 'quadruple' || t === 'quad') && (n1 === 'bogey' || n1 === 'bogie' || n1 === 'bogeys')) { relAdd({ double: 2, triple: 3, quadruple: 4, quad: 4 }[t], i, 2); i++; continue; }
            if (t === 'double' && n1 === 'par') return ask('double-par', 'Double par is ' + (par ? par * 2 : 'twice par') + ' — say the number to be sure.');
            if (t === 'double' || t === 'doubled') { relAdd(2, i, 1); continue; }
            if (t === 'triple' || t === 'tripled') { relAdd(3, i, 1); continue; }
            if (t === 'quad' || t === 'quadruple') { relAdd(4, i, 1); continue; }
            if (t === 'bogey' || t === 'bogie' || t === 'bogy' || t === 'bogeyed') { relAdd(1, i, 1); continue; }
            if ((t === 'even' && n1 === 'par') || t === 'parred' || t === 'parr') { relAdd(0, i, t === 'even' ? 2 : 1); if (t === 'even') i++; continue; }
            if (t === 'par') {
                // "par 4" (the hole's par said with it): fine when it IS this hole's par.
                if (numOf(n1) != null && !gone[i + 1] && numOf(n1) >= 3 && numOf(n1) <= 6) {
                    if (par && numOf(n1) !== par) return ask('par-mismatch', 'This hole is a par ' + par + ', not a par ' + numOf(n1) + '. What did you make?');
                    if (!par) par = numOf(n1);
                    relAdd(0, i, 2); i++; continue;
                }
                relAdd(0, i, 1); continue;
            }
            var by = numOf(t);
            if (by != null && (n1 === 'over' || n1 === 'under') && !gone[i]) {
                if (toks[i + 2] === 'par') take(i + 2);
                relAdd(n1 === 'over' ? by : -by, i, 2); i++; continue;
            }
        }

        // ---- "same as last hole" ------------------------------------------------------------
        var same = /\bsame( as| score as)? (the )?(last|previous|before)( hole| time| one)?\b|\bsame again\b|\bditto\b/.test(said);
        if (same) toks.forEach(function (x, k) { if (/^(same|as|last|previous|before|again|ditto|score)$/.test(x) || (x === 'hole' && !holeSaid) || x === 'time') gone[k] = 1; });

        // ---- the golfer -------------------------------------------------------------------
        var G = findGolfers(toks, golfers);
        var ids = {}, picks = [];
        G.full.forEach(function (f) { if (!ids[f.g.id]) { ids[f.g.id] = 1; picks.push(f.g); } take(f.at, f.len); });
        var ambiguous = null;
        Object.keys(G.partial).forEach(function (k) {
            var hits = G.partial[k];
            take(Number(k));
            if (hits.length > 1) {
                var already = hits.filter(function (g) { return ids[g.id]; });
                if (already.length === 1) return;
                ambiguous = ambiguous || hits;
                return;
            }
            if (!ids[hits[0].id]) { ids[hits[0].id] = 1; picks.push(hits[0]); }
        });
        var selfSaid = toks.some(function (x, k) { return !gone[k] && SELF[x]; });
        var othersSaid = toks.some(function (x) { return OTHERS[x]; });
        // A name after "for" / "give" that is not a golfer here.
        var unknown = null;
        toks.forEach(function (x, k) {
            if (unknown || gone[k]) return;
            var b = toks[k - 1];
            if ((b === 'for' || b === 'give') && !NOT_NAME[x] && numOf(x) == null && ordOf(x) == null && /^[a-z']{2,}$/.test(x) && !SELF[x]) unknown = x.replace(/'s$/, '');
            if (NAME_AFTER[toks[k + 1]] && k === 0 && !SELF[x] && !NOT_NAME[x] && numOf(x) == null && /^[a-z']{2,}$/.test(x) && !NOT_LEAD.test(x)) unknown = x.replace(/'s$/, '');
        });
        if (ambiguous) {
            if (picks.length) return ask('two-golfers', 'One golfer at a time \u2014 say a name and a score.');
            return ask('which-golfer', 'Which ' + firstName(ambiguous[0].name) + '?', { choices: ambiguous.map(function (g) { return { id: g.id, name: g.name }; }) });
        }
        if (picks.length > 1) return ask('two-golfers', 'One golfer at a time — say a name and a score.');
        if (othersSaid && !picks.length) return ask('who', 'Who is it for? Say a name and a score, one golfer at a time.');
        var golfer = null;
        if (picks.length === 1) {
            golfer = picks[0];
            if (selfSaid && ctx.me != null && String(ctx.me) !== String(golfer.id)) return ask('who', 'Is that for you or for ' + firstName(golfer.name) + '?',
                { choices: [golfers.filter(function (g) { return String(g.id) === String(ctx.me); })[0], golfer].filter(Boolean).map(function (g) { return { id: g.id, name: g.name }; }) });
        } else if (unknown) {
            return ask('unknown-golfer', 'I don’t have ' + unknown.charAt(0).toUpperCase() + unknown.slice(1) + ' in this group. Who is it for?', { choices: golfers.map(function (g) { return { id: g.id, name: g.name }; }) });
        } else if (ctx.me != null && golfers.some(function (g) { return String(g.id) === String(ctx.me); })) {
            golfer = golfers.filter(function (g) { return String(g.id) === String(ctx.me); })[0];
        } else if (golfers.length === 1) {
            golfer = golfers[0];
        }

        // ---- the number for the score -----------------------------------------------------
        var nums = [];
        toks.forEach(function (x, k) {
            if (gone[k]) return;
            var v = numOf(x);
            if (v == null) return;
            nums.push(v);
        });
        var distinct = nums.filter(function (v, k) { return nums.indexOf(v) === k; });
        if (distinct.length > 1) return ask('two-scores', 'I heard ' + distinct.join(' and ') + '. Which is the score?');
        var strokes = distinct.length ? distinct[0] : null;
        var relDistinct = rels.filter(function (v, k) { return rels.indexOf(v) === k; });
        if (relDistinct.length > 1) return ask('two-scores', 'I heard ' + relDistinct.map(function (d) { return d === 'ace' ? 'a hole in one' : relName(d); }).join(' and ') + '. Which one?');
        var rel = relDistinct.length ? relDistinct[0] : null;
        if (rel != null) {
            var fromRel = rel === 'ace' ? 1 : (par ? par + rel : null);
            if (fromRel == null) return ask('no-par', 'I don’t have the par for hole ' + hole + '. Say the number, like “a 5”.');
            if (strokes != null && strokes !== fromRel) return ask('conflict', (rel === 'ace' ? 'A hole in one' : relName(rel).charAt(0).toUpperCase() + relName(rel).slice(1)) + ' is a ' + fromRel + ', not a ' + strokes + '. Which is it?');
            strokes = fromRel;
        }
        if (same && strokes == null) {
            if (!golfer) return ask('who', 'Who is it for? Say a name and a score.', { choices: golfers.map(function (g) { return { id: g.id, name: g.name }; }) });
            var pv = ctx.prev ? Number(ctx.prev[golfer.id]) : NaN;
            if (!(pv >= 1)) return ask('no-last', 'I don’t have ' + (String(golfer.id) === String(ctx.me) ? 'your' : firstName(golfer.name) + '’s') + ' last hole. Say the number.');
            strokes = pv;
        }
        if (strokes == null) {
            if (puttsSaid) return ask('no-score', putts + (putts === 1 ? ' putt' : ' putts') + ' — and what did ' + (golfer && String(golfer.id) !== String(ctx.me) ? firstName(golfer.name) : 'you') + ' make?');
            if (!hasScoreWord && !golfer) return ask('no-score', 'I didn’t hear a score. Say it like “a 5, two putts”.');
            return ask('no-score', 'What did ' + (golfer && String(golfer.id) !== String(ctx.me) ? firstName(golfer.name) : 'you') + ' make? Say the number.');
        }
        if (!(strokes >= 1 && strokes <= MAX_STROKES)) return ask('score-range', strokes + ' isn’t a score I can save. Say it again.');
        if (putts != null && putts > strokes - 1) return ask('putts-too-many', putts + (putts === 1 ? ' putt' : ' putts') + ' on a ' + strokes + ' isn’t possible. Say the score and putts again.');
        if (!golfer) return ask('who', 'Who is the ' + strokes + ' for?', { choices: golfers.map(function (g) { return { id: g.id, name: g.name }; }), strokes: strokes, putts: putts });
        return { kind: 'score', golfer: { id: golfer.id, name: golfer.name }, hole: hole, strokes: strokes, putts: putts,
            rel: strokes === 1 ? 'hole in one' : (par ? relName(strokes - par) : null), par: par, said: said };
    }

    // The words read back before anything is saved: "Mike · 5 (bogey) · 2 putts · hole 7".
    function summary(r, opts) {
        if (!r || r.kind !== 'score') return '';
        var me = opts && opts.me != null && String(opts.me) === String(r.golfer.id);
        var who = me ? 'You' : firstName(r.golfer.name);
        var s = who + ', a ' + r.strokes + (r.rel ? ' (' + r.rel + ')' : '') + ' on hole ' + r.hole;
        if (r.putts != null) s += ', ' + r.putts + (r.putts === 1 ? ' putt' : ' putts');
        return s;
    }

    var api = { parse: parse, summary: summary, norm: norm, relName: relName, MAX_STROKES: MAX_STROKES, MAX_PUTTS: MAX_PUTTS };
    if (typeof window !== 'undefined') window.HardPanVoiceParse = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
