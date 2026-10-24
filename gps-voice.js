// ============================================================================
// HARDPAN GPS - VOICE SCORING (URGENT-066 feature 4): push-to-talk + Siri. window.HardPanVoice.
//
// THE ONE WAY A SCORE GOES IN: the words are parsed (gps-voice-parse.js, a fixed grammar, no AI),
// then PROPOSED to the round screen's feature registry (customize-screen, feature-registry.js):
//     ctx.proposeScores([{ pid, hole, strokes, putts? }], { source: 'voice' })
// which opens the NORMAL score sheet pre-filled - that sheet is the quick confirm, and its Save is
// the card's own save (index.html gpsOpenSheet -> saveScore -> the offline queue). This file never
// writes a score, a stat or anything to the database. With no mounted ctx (Siri, or before the
// registry has mounted us) the proposal goes as the window event 'hardpan:propose-scores'
// ({ detail: { scores: [...], source: 'voice' } }), which the registry routes to the same sheet.
//
//   start(opts)   listen through the native HardPanVoice plugin (Apple's speech recognizer, ON THE
//                 PHONE when the phone supports it). A small sheet shows the words as they come.
//                 opts.transcript: skip the microphone and use these words (tests, the Simulator).
//   stop()        push-to-talk released: the words so far are the answer.
//   cancel()      close; nothing proposed.
//   handle(text)  the words -> a proposal, or a question back in the sheet (never a guess).
//   choose(c)     the answer to a question: a golfer ("Which Mike?") or a hole (a held Siri score).
//   attach(btn)   hold-to-talk on a button. The registry def below mounts the dock button.
//
// SIRI / AIRPODS (App Intents in the app, HardPanVoiceIntents.swift): the intent hands its words
// to this page ('voiceIntent' from the plugin); the same grammar runs here, and a score is proposed
// to the same sheet on the phone; Siri says what it put up. When this page can't answer (the phone
// is locked or the app is in the background so iOS has paused the web view, or no round is open)
// the intent says so and the plugin HOLDS the words on the phone; the next time a round is open here
// they are proposed (the golfer picks the hole when Siri could not know it).
//
// NOTHING LEAVES THE PHONE: no audio, words or position is sent anywhere by this file. Held Siri
// words stay on the phone until used or 2 hours pass.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var D = W.document;
    var HOLD_MS = 2 * 3600 * 1000, INTENT_MAX_AGE_MS = 15000;
    var st = { open: false, phase: 'idle', text: '', result: null, listening: false, from: null, held: null, msg: '' };
    var ctxFn = null, testPlugin = null, hooked = false, regCtx = null, pendingStart = null;

    function Parser() {
        if (W.HardPanVoiceParse) return W.HardPanVoiceParse;
        if (typeof require === 'function') { try { return require('./gps-voice-parse.js'); } catch (e) {} }
        return null;
    }
    // index.html carries ONE script tag (this file): the parser comes in beside it.
    if (D && !W.HardPanVoiceParse && typeof D.createElement === 'function' && D.head) {
        try { var ps = D.createElement('script'); ps.src = 'gps-voice-parse.js'; D.head.appendChild(ps); } catch (e) {}
    }

    // ---- the native plugin -----------------------------------------------------------------
    function native() { try { return !!(W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function' && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
    function plugin() {
        if (testPlugin) return testPlugin;
        if (!native()) return null;
        var C = W.Capacitor;
        try { return (C.Plugins && C.Plugins.HardPanVoice) || (typeof C.registerPlugin === 'function' ? (C.__hpVoice = C.__hpVoice || C.registerPlugin('HardPanVoice')) : null); } catch (e) { return null; }
    }
    function featureOn() { try { return typeof W.HardPanFeature !== 'function' || W.HardPanFeature('voice') !== false; } catch (e) { return true; } }
    function first(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

    // ---- the round -> the parser's ctx. READ ONLY. --------------------------------------------
    // From the registry's ctx (round, hole, me, role, yardage, proposeScores) when it has mounted us;
    // else read from the card (index.html globals) - read, never written.
    function parOfRound(round) {
        var pars = round && round.pars, cd = (round && round.courseData) || [];
        return function (n) {
            n = Number(n);
            if (pars) { var v = Array.isArray(pars) ? (pars[n - 1] && typeof pars[n - 1] === 'object' ? pars[n - 1].par : pars[n - 1]) : pars[n]; if (Number(v) > 0) return Number(v); }
            var m = cd.filter(function (h) { return h && Number(h.hole) === n; })[0];
            return m && Number(m.par) > 0 ? Number(m.par) : null;
        };
    }
    function holesOf(round) {
        var cd = ((round && round.courseData) || []).filter(function (h) { return h && h.hole; }).map(function (h) { return Number(h.hole); });
        if (cd.length) return cd;
        var pars = round && round.pars;
        if (Array.isArray(pars) && pars.length) return pars.map(function (_, i) { return i + 1; });
        if (pars && typeof pars === 'object' && Object.keys(pars).length) return Object.keys(pars).map(Number).filter(function (x) { return x >= 1; }).sort(function (a, b) { return a - b; });
        return null;
    }
    function fromRound(round, hole, me, role, extra) {
        if (!round || !Array.isArray(round.players) || !round.players.length) return null;
        hole = Number(hole) || null;
        var parOf = parOfRound(round), holes = holesOf(round), scores = round.scores || {};
        var players = round.players.filter(function (p) { return p && p.out !== true; });
        var prevHole = hole ? (holes && holes.indexOf(hole) > 0 ? holes[holes.indexOf(hole) - 1] : hole - 1) : null;
        var prev = {};
        players.forEach(function (p) { var v = Number(scores['p' + p.id + '_h' + prevHole]); if (v > 0) prev[p.id] = v; });
        var c = {
            code: String(round.code || round.eventCode || ''), hole: hole, par: hole ? parOf(hole) : null, parOf: parOf, holes: holes,
            golfers: players.map(function (p) { return { id: p.id, name: String(p.name || ('Player ' + p.id)) }; }),
            me: me != null ? String(me) : null, prev: prev, role: role || null,
            score: function (pid, n) { var v = Number(scores['p' + pid + '_h' + n]); return v > 0 ? v : null; }
        };
        if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
        return c;
    }
    function lex(fn) { try { return fn(); } catch (e) { return undefined; } }
    /* global currentData, currentMode, currentViewedHole */
    function cardCtx() {
        var data = lex(function () { return currentData; }), code = lex(function () { return currentMode; });
        if (!data || !code) return null;
        var gh = W.HardPanGps && typeof W.HardPanGps.hole === 'function' ? W.HardPanGps.hole() : null;
        var hole = Number(lex(function () { return currentViewedHole; })) || Number(gh) || null;
        var me = lex(function () { return typeof W.qsMeId === 'function' ? W.qsMeId() : null; });
        var round = { code: code, players: data.players, scores: data.scores, courseData: data.courseData };
        return fromRound(round, hole, me, null, {
            canWrite: function (pid) { try { return typeof W.canWritePlayer === 'function' ? !!W.canWritePlayer(pid) : true; } catch (e) { return false; } }
        });
    }
    function regToCtx(rc) {
        if (!rc) return null;
        var r = rc.round || {};
        return fromRound(Object.assign({ code: r.code }, r), rc.hole, rc.me, rc.role, {
            proposeScores: typeof rc.proposeScores === 'function' ? rc.proposeScores : null,
            yardageFn: typeof rc.yardage === 'function' ? rc.yardage : null,
            ent: rc.ent || null
        });
    }
    function ctx() { try { if (ctxFn) return ctxFn(); var c = regToCtx(regCtx); return c || cardCtx(); } catch (e) { return null; } }

    // ---- the words -> a result --------------------------------------------------------------
    function parseNow(text, c) {
        var P = Parser();
        if (!P) return { kind: 'ask', reason: 'loading', ask: 'One second — voice scoring is still loading. Try again.' };
        c = c || ctx();
        if (!c) return { kind: 'noround', ask: 'Open your round first — then say the score.' };
        var r = P.parse(text, c);
        if (r.kind === 'score') {
            if (c.role === 'watching' || (typeof c.canWrite === 'function' && !c.canWrite(r.golfer.id)))
                return { kind: 'ask', reason: 'cannot-score', ask: 'This phone can’t score ' + first(r.golfer.name) + ' (it isn’t this phone’s card).' };
            r.was = typeof c.score === 'function' ? c.score(r.golfer.id, r.hole) : null;
        }
        return r;
    }
    function sayOf(r, c) {
        if (!r) return '';
        if (r.kind !== 'score') return r.ask || '';
        var s = Parser().summary(r, { me: c && c.me });
        if (r.was != null && r.was !== r.strokes) s += ' (it has a ' + r.was + ' now)';
        return s;
    }
    // "What's my yardage": the registry's ctx.yardage() (the GPS screen's own numbers), else the numbers
    // the GPS screen shows. Never a position.
    function yardage(c) {
        c = c || ctx();
        var y = null;
        try { y = c && c.yardageFn ? c.yardageFn() : null; } catch (e) { y = null; }
        if (!y) {
            var G = W.HardPanGps;
            if (!G || typeof G.isMounted !== 'function' || !G.isMounted() || !D) return { ok: false, say: 'Open the GPS screen for your yardage.' };
            var txt = function (sel) { var e = D.querySelector('#gps-overlay ' + sel); var v = e ? String(e.textContent || '').trim() : ''; return /^\d{1,4}$/.test(v) ? Number(v) : null; };
            var legs = null; try { legs = typeof G.playsLegs === 'function' ? G.playsLegs() : null; } catch (e) { legs = null; }
            var u = D.querySelector('#gps-overlay .gps-units');
            y = { front: txt('.gps-f'), middle: txt('.gps-m') != null ? txt('.gps-m') : (legs && legs.toGreen ? legs.toGreen.yards : null), back: txt('.gps-b'),
                playsLike: legs && legs.toGreen ? legs.toGreen.plays : null, units: u && /meter/i.test(u.textContent || '') ? 'm' : 'yd' };
        }
        return yardageWords(y);
    }
    function yardageWords(y) {
        if (!y || !(Number(y.middle) > 0)) return { ok: false, say: 'No yardage yet — the GPS is still finding you.' };
        var unit = y.units === 'm' ? 'meters' : 'yards';
        var s = Math.round(y.middle) + ' ' + unit + ' to the middle';
        if (Number(y.front) > 0 && Number(y.back) > 0) s += ', ' + Math.round(y.front) + ' front, ' + Math.round(y.back) + ' back';
        if (Number(y.playsLike) > 0 && Math.round(y.playsLike) !== Math.round(y.middle)) s += '. Plays ' + Math.round(y.playsLike);
        return { ok: true, say: s + '.', front: y.front, middle: y.middle, back: y.back, playsLike: y.playsLike, units: y.units };
    }
    // THE PROPOSAL: the registry's normal score sheet, pre-filled. Nothing is saved here.
    function propose(r, c) {
        var row = { pid: r.golfer.id, hole: r.hole, strokes: r.strokes };
        if (r.putts != null) row.putts = r.putts;
        var list = [row], opts = { source: 'voice' };
        if (c && typeof c.proposeScores === 'function') { c.proposeScores(list, opts); return { via: 'ctx', scores: list }; }
        try {
            var ev = typeof W.CustomEvent === 'function' ? new W.CustomEvent('hardpan:propose-scores', { detail: { scores: list, source: 'voice' } }) : null;
            if (ev && typeof W.dispatchEvent === 'function') W.dispatchEvent(ev);
        } catch (e) {}
        return { via: 'event', scores: list };
    }

    // ---- the sheet: listening, and questions (never the save) -------------------------------------
    var CSS = '#hp-voice-sheet{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.35);font:600 16px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#f4f4ef;color-scheme:dark;}'
        + '#hp-voice-sheet .hpv{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:560px;background:#111611;border-radius:24px 24px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.45);padding:10px 18px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;}'
        + '#hp-voice-sheet .hpv-handle{width:42px;height:5px;border-radius:3px;background:#5b625a;margin:0 auto 10px;}'
        + '#hp-voice-sheet .hpv-h{font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#d7dcd3;margin:0 0 6px;display:flex;align-items:center;gap:8px;}'
        + '#hp-voice-sheet .hpv-dot{width:10px;height:10px;border-radius:50%;background:#c8f07a;flex:0 0 auto;}#hp-voice-sheet .hpv-live .hpv-dot{animation:hpvpulse 1s ease-in-out infinite;}'
        + '@keyframes hpvpulse{0%,100%{opacity:1}50%{opacity:.25}}'
        + '#hp-voice-sheet .hpv-heard{font-size:15px;color:#a7aea4;margin:0 0 10px;min-height:20px;word-break:break-word;}'
        + '#hp-voice-sheet .hpv-main{font-size:clamp(20px,6vw,26px);font-weight:800;color:#fff;margin:4px 0 6px;line-height:1.2;}'
        + '#hp-voice-sheet .hpv-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}'
        + '#hp-voice-sheet .hpv-b{flex:1 1 0;min-width:max-content;min-height:52px;border:0;border-radius:14px;background:#262c26;color:#f4f4ef;font:inherit;font-size:17px;font-weight:700;padding:0 14px;}'
        + '#hp-voice-sheet .hpv-b.hpv-go{background:#c8f07a;color:#0b0f0c;font-weight:800;}#hp-voice-sheet .hpv-choice{flex:1 1 40%;}'
        + '.hpf-voice{width:100%;height:100%;border:0;border-radius:16px;background:rgba(17,22,17,.86);color:#f4f4ef;font:700 12px/1.1 -apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}'
        + '.hpf-voice span{font-size:24px;}.hpf-voice.hpf-on{background:#c8f07a;color:#0b0f0c;}';
    function el(tag, cls, text) { var e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function css() { if (D && D.head && !D.getElementById('hp-voice-css')) { var s = el('style'); s.id = 'hp-voice-css'; s.textContent = CSS; D.head.appendChild(s); } }
    function sheet() {
        if (!D || !D.body) return null;
        css();
        var sh = D.getElementById('hp-voice-sheet');
        if (!sh) {
            sh = el('div'); sh.id = 'hp-voice-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Voice score');
            sh.addEventListener('click', function (e) { if (e.target === sh) cancel(); });
            D.body.appendChild(sh);
        }
        return sh;
    }
    function btn(label, cls, fn, data) {
        var b = el('button', 'hpv-b' + (cls ? ' ' + cls : ''), label); b.type = 'button';
        if (data) Object.keys(data).forEach(function (k) { b.setAttribute('data-' + k, data[k]); });
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
        return b;
    }
    function draw() {
        var sh = sheet(); if (!sh) return;
        sh.innerHTML = '';
        var box = el('div', 'hpv' + (st.phase === 'listening' ? ' hpv-live' : ''));
        box.appendChild(el('div', 'hpv-handle'));
        var head = el('div', 'hpv-h'); head.appendChild(el('span', 'hpv-dot'));
        var title = { listening: 'Listening…', ask: st.from === 'held' ? 'From Siri' : 'One more thing', yardage: 'Yardage' }[st.phase] || 'Voice scoring';
        head.appendChild(el('span', '', title)); box.appendChild(head);
        box.appendChild(el('div', 'hpv-heard', st.text ? '“' + st.text + '”' : (st.phase === 'listening' ? 'Say a score, like “a 5, two putts” or “bogey for Mike”.' : '')));
        var row = el('div', 'hpv-row'), r = st.result;
        if (st.phase === 'listening') {
            row.appendChild(btn('Done', 'hpv-go', function () { stop(); }, { hpv: 'done' }));
            row.appendChild(btn('Cancel', '', cancel, { hpv: 'cancel' }));
        } else if (st.phase === 'ask' && r) {
            box.appendChild(el('div', 'hpv-main', r.ask));
            (r.choices || []).forEach(function (c) {
                row.appendChild(btn(c.name || ('Hole ' + c.hole), 'hpv-choice', function () { choose(c); }, { 'hpv-choice': c.id != null ? String(c.id) : 'h' + c.hole }));
            });
            row.appendChild(btn('Try again', 'hpv-go', function () { start({ from: 'mic' }); }, { hpv: 'again' }));
            row.appendChild(btn('Cancel', '', cancel, { hpv: 'cancel' }));
        } else {
            box.appendChild(el('div', 'hpv-main', st.msg || ''));
            if (st.phase === 'yardage') row.appendChild(btn('Done', 'hpv-go', cancel, { hpv: 'done' }));
            else { row.appendChild(btn('Try again', 'hpv-go', function () { start({ from: 'mic' }); }, { hpv: 'again' })); row.appendChild(btn('Close', '', cancel, { hpv: 'cancel' })); }
        }
        box.appendChild(row); sh.appendChild(box);
        st.open = true;
    }
    function close() {
        st.open = false;
        var sh = D && D.getElementById && D.getElementById('hp-voice-sheet');
        if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
    }
    function settle() { if (pendingStart) { var f = pendingStart; pendingStart = null; f(state()); } }
    function setPhase(phase, extra) {
        st.phase = phase;
        if (extra) Object.keys(extra).forEach(function (k) { st[k] = extra[k]; });
        if (phase === 'proposed' || phase === 'idle') close(); else if (D) draw();
        if (phase !== 'listening') settle();
    }

    // ---- the flow ------------------------------------------------------------------------------
    function names(c) { return ((c && c.golfers) || []).map(function (x) { return first(x.name); }).filter(Boolean); }
    function start(opts) {
        opts = opts || {};
        settle();
        st.from = opts.from || 'mic'; st.text = ''; st.result = null; st.msg = ''; st.proposal = null;
        var done = new Promise(function (res) { pendingStart = res; });
        if (typeof opts.transcript === 'string') { setPhase('listening'); handle(opts.transcript); return done; }
        if (!featureOn()) { setPhase('unavailable', { msg: 'Voice scoring is off on this phone.' }); return done; }
        var pl = plugin();
        if (!pl) { setPhase('unavailable', { msg: 'Voice scoring works in the HardPan GPS app on iPhone.' }); return done; }
        hook(pl);
        setPhase('listening');
        var c = ctx();
        Promise.resolve(typeof pl.requestPermission === 'function' ? pl.requestPermission() : { speech: 'granted', mic: 'granted' }).then(function (perm) {
            if (st.phase !== 'listening') return null;
            if (!perm || perm.speech !== 'granted' || perm.mic !== 'granted') {
                setPhase('denied', { msg: 'Voice scoring needs the microphone and Speech Recognition. Turn them on in Settings › HardPan GPS — or just tap your score in.' });
                return null;
            }
            st.listening = true;
            return Promise.resolve(pl.start({ contextualStrings: names(c).concat(['birdie', 'bogey', 'double bogey', 'par', 'eagle', 'putts', 'two putts', 'three putts']) })).then(function (r) {
                st.listening = false;
                if (st.phase !== 'listening') return;   // cancelled meanwhile
                if (!r || r.ok === false) { setPhase('error', { msg: r && r.why === 'unavailable' ? 'Speech recognition isn’t available right now. Tap your score in.' : 'I couldn’t hear that. Try again, or tap your score in.' }); return; }
                handle(String(r.text || ''));
            });
        }).then(null, function () { st.listening = false; if (st.phase === 'listening') setPhase('error', { msg: 'I couldn’t hear that. Try again, or tap your score in.' }); });
        return done;
    }
    function stop() { var pl = plugin(); if (pl && st.listening && typeof pl.stop === 'function') { try { pl.stop(); } catch (e) {} } return true; }
    function cancel() {
        var pl = plugin();
        if (pl && st.listening && typeof pl.cancel === 'function') { try { pl.cancel(); } catch (e) {} }
        st.listening = false;
        var was = st.open;
        st.phase = 'idle'; close(); settle();
        return was;
    }
    function finish(r, c) {
        st.result = r; st.ctx = c;
        if (r.kind === 'score') { var p = propose(r, c); st.proposal = p; setPhase('proposed'); clearHeld(); return r; }
        if (r.kind === 'cancel') { cancel(); return r; }
        if (r.kind === 'yardage') { var y = yardage(c); setPhase('yardage', { msg: y.say }); return r; }
        if (r.kind === 'noround') { setPhase('error', { msg: r.ask }); return r; }
        setPhase('ask'); return r;
    }
    function handle(text, opts) {
        st.text = String(text || '').trim();
        var c = (opts && opts.ctx) || ctx();
        return finish(parseNow(st.text, c), c);
    }
    function choose(ch) {
        var base = st.ctx || ctx(); if (!base || !ch) return null;
        if (ch.hole != null) return handle(st.text, { ctx: Object.assign({}, base, { hole: Number(ch.hole), par: base.parOf ? base.parOf(ch.hole) : base.par }) });
        if (ch.id == null) return null;
        // The same words, for the golfer picked: that golfer is the only one in the list, and the
        // name the parser could not place is taken out ("for Mikey", "Bob got").
        var only = (base.golfers || []).filter(function (x) { return String(x.id) === String(ch.id); });
        if (!only.length) return null;
        var nc = Object.assign({}, base, { golfers: only });   // me stays: the one golfer listed is the answer either way
        var words = Parser().norm(st.text).replace(/\b(for|give)\s+[a-z']+/g, ' ').replace(/^[a-z']+\s+(?=(got|made|had|shot|scored|carded|gets|has)\b)/, '');
        return finish(parseNow(words, nc), nc);
    }
    function clearHeld() {
        if (!st.held) return;
        var pl = plugin(), id = st.held; st.held = null;
        if (pl && typeof pl.clearHeld === 'function') { try { var r = pl.clearHeld({ id: id }); if (r && typeof r.then === 'function') r.then(null, function () {}); } catch (e) {} }
    }

    // ---- Siri: the intents, through the plugin -------------------------------------------------
    function reply(pl, id, o) { try { var r = pl.intentReply(Object.assign({ id: id }, o)); if (r && typeof r.then === 'function') r.then(null, function () {}); } catch (e) {} return o; }
    function intent(ev, pl) {
        pl = pl || plugin();
        if (!ev || !pl) return null;
        var id = String(ev.id || '');
        if (ev.at && Date.now() - Number(ev.at) > INTENT_MAX_AGE_MS) return null;   // Siri has given up on it; the plugin held it
        if (ev.kind === 'yardage') { var y = yardage(); return reply(pl, id, { status: y.ok ? 'ok' : 'none', say: y.say }); }
        if (ev.kind !== 'score') return reply(pl, id, { status: 'error', say: 'I didn’t understand that.' });
        if (!featureOn()) return reply(pl, id, { status: 'off', say: 'Voice scoring is off in HardPan on this phone.' });
        var c = ctx();
        if (!c) return reply(pl, id, { status: 'noround', say: 'Open your round in HardPan first, then ask me again.' });
        var r = parseNow(String(ev.words || ''), c);
        if (r.kind === 'score') {
            propose(r, c);
            return reply(pl, id, { status: 'proposed', say: sayOf(r, c) + '. It’s on your screen — tap Save to keep it.' });
        }
        if (r.kind === 'yardage') { var y2 = yardage(c); return reply(pl, id, { status: y2.ok ? 'ok' : 'none', say: y2.say }); }
        if (r.kind === 'cancel') return reply(pl, id, { status: 'cancel', say: 'OK, nothing saved.' });
        if (r.kind === 'noround') return reply(pl, id, { status: 'noround', say: r.ask });
        return reply(pl, id, { status: r.reason === 'cannot-score' ? 'cannot' : 'ask', say: r.ask });
    }
    // Words Siri held while this page was asleep: proposed now, on the hole they were said on.
    function held(pl) {
        pl = pl || plugin();
        if (!pl || typeof pl.held !== 'function' || st.open) return Promise.resolve(null);
        return Promise.resolve(pl.held()).then(function (res) {
            var items = ((res && res.items) || []).filter(function (x) { return x && x.words && Date.now() - Number(x.at || 0) < HOLD_MS; });
            var c = ctx();
            if (!items.length || !c) return null;
            var it = items.filter(function (x) { return !x.round || String(x.round) === c.code; })[0];
            if (!it) return null;
            st.from = 'held'; st.held = it.id || null; st.text = String(it.words);
            if (it.hole >= 1) return finish(parseNow(st.text, Object.assign({}, c, { hole: Number(it.hole), par: c.parOf ? c.parOf(it.hole) : c.par })), c) && it;
            // Siri could not see which hole: never guessed - the golfer picks.
            var r = parseNow(st.text, c);
            if (r.kind !== 'score') { finish(r, c); return it; }
            var hs = c.holes || [], at = hs.indexOf(c.hole), prevH = at > 0 ? hs[at - 1] : (c.hole > 1 ? c.hole - 1 : null);
            st.ctx = c;
            st.result = { kind: 'ask', reason: 'which-hole', ask: 'Siri heard this while the phone was locked. Which hole was it for?', choices: [prevH, c.hole].filter(function (h) { return h >= 1; }).map(function (h) { return { hole: h }; }) };
            setPhase('ask');
            return it;
        }, function () { return null; });
    }
    function hook(pl) {
        if (hooked || !pl || typeof pl.addListener !== 'function') return;
        hooked = true;
        try { pl.addListener('voiceIntent', function (ev) { intent(ev, pl); }); } catch (e) {}
        try { pl.addListener('voicePartial', function (ev) { if (st.phase === 'listening' && ev && ev.text != null) { st.text = String(ev.text); draw(); } }); } catch (e) {}
    }
    function boot() {
        var pl = plugin();
        if (!pl) return;
        hook(pl);
        setTimeout(function () { held(pl); }, 2500);
        if (D) D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'visible') setTimeout(function () { held(pl); }, 800); });
    }

    // ---- hold-to-talk ----------------------------------------------------------------------------
    function attach(b) {
        if (!b || b.__hpVoice) return b;
        b.__hpVoice = true;
        var downAt = 0;
        b.addEventListener('pointerdown', function (e) { if (e && e.preventDefault) e.preventDefault(); downAt = Date.now(); start({ from: 'mic' }); });
        // Held 400 ms+: letting go = done (push-to-talk). A quick tap: it listens until the golfer stops talking.
        var up = function () { if (downAt && Date.now() - downAt > 400) stop(); downAt = 0; };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
        b.setAttribute('aria-label', 'Say your score');
        return b;
    }
    function state() { return { open: st.open, phase: st.phase, text: st.text, result: st.result, msg: st.msg || '', from: st.from, proposal: st.proposal || null }; }

    // ---- the round screen's feature registry (customize-screen) --------------------------------
    var DEF = {
        id: 'voice', label: 'Voice scoring', sub: 'Say your score — “a 5, two putts”', icon: '🎤', isNew: true,
        kind: 'button', slot: 'dock', screens: ['round'], defaultOn: false,
        // FREE: saying a score is scoring, which is free. The yardage answer is the GPS screen's own
        // numbers, so it is there only when the GPS Map is.
        tier: 'free',
        available: function () { return !!plugin() && featureOn(); },
        unlocked: function () { return true; },
        mount: function (host, rc) {
            regCtx = rc || null;
            if (!host || !D) return { update: function (c) { regCtx = c || regCtx; }, unmount: function () { regCtx = null; } };
            css();
            var b = el('button', 'hpf-voice'); b.type = 'button';
            b.appendChild(el('span', '', '🎤')); b.appendChild(D.createTextNode('Score'));
            host.appendChild(b); attach(b);
            return {
                update: function (c) { regCtx = c || regCtx; },
                unmount: function () { if (st.open) cancel(); if (b.parentNode) b.parentNode.removeChild(b); regCtx = null; }
            };
        }
    };
    (W.HardPanFeatureQueue = W.HardPanFeatureQueue || []).push(DEF);

    var api = {
        start: start, stop: stop, cancel: cancel, handle: function (t) { return handle(t); }, choose: choose,
        parse: function (t) { return parseNow(t); }, yardage: function () { return yardage(); }, attach: attach, state: state,
        isOpen: function () { return st.open; },
        available: function () { var pl = plugin(); if (!pl || typeof pl.available !== 'function') return Promise.resolve({ available: false, why: 'web' }); return Promise.resolve(pl.available()); },
        setContext: function (fn) { ctxFn = typeof fn === 'function' ? fn : null; },
        feature: DEF,
        intent: function (ev) { return intent(ev); }, held: function () { return held(); },
        _plugin: function (p) { testPlugin = p || null; hooked = false; if (p) hook(p); },
        _reset: function () { cancel(); st = { open: false, phase: 'idle', text: '', result: null, listening: false, from: null, held: null, msg: '' }; ctxFn = null; regCtx = null; pendingStart = null; }
    };
    W.HardPanVoice = api;
    if (D && typeof D.addEventListener === 'function') { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot(); }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
