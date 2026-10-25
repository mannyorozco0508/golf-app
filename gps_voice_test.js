// ============================================================================
// URGENT-066 #4 - VOICE SCORING: gps-voice.js (window.HardPanVoice), against a STUB of the round
// screen's feature registry (customize-screen's API: HardPanFeatureQueue + ctx.proposeScores) and a
// stub of the native HardPanVoice plugin. What is held here:
//   - ONE registry def (id voice, dock button, off by default, free), available only with the plugin
//   - start() -> words -> ctx.proposeScores([{ pid, hole, strokes, putts }], { source: 'voice' }):
//     the quick confirm is the normal score sheet; this file NEVER saves (no saveScore, no db)
//   - no mounted ctx: the 'hardpan:propose-scores' window event, the same payload
//   - questions instead of guesses; a pick answers them; a watching phone can't score
//   - the mic: permission asked first, denied = a plain message and no listening; cancel stops it
//   - Siri: score -> proposed + what Siri says; yardage from ctx.yardage(); stale intents ignored;
//     words held while the page slept come back proposed on their hole (or the golfer picks it)
//   - nothing leaves the phone: no network, no position, no database in the voice files
// Made-up golfers ("Test ..."); nothing is written anywhere.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-voice.js'))) { console.log('Consumer tree: no voice scoring - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');

function load(opts) {
    const o = opts || {};
    const events = [];
    global.window = {
        HardPanVoiceParse: require('./gps-voice-parse.js'),
        Capacitor: o.native ? { isNativePlatform: () => true, Plugins: {} } : undefined,
        dispatchEvent: (e) => { events.push(e); return true; },
        CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
        saveScore: () => { throw new Error('gps-voice.js must never save a score itself'); },
        HardPanFeatureQueue: o.queue || undefined
    };
    delete require.cache[require.resolve('./gps-voice.js')];
    require('./gps-voice.js');
    return { V: global.window.HardPanVoice, events, W: global.window };
}
const ROUND = { code: 'T066', players: [{ id: '101', name: 'Manny Test' }, { id: '102', name: 'Mike Test' }, { id: '103', name: 'Dave Test' }, { id: '104', name: 'Out Test', out: true }],
    courseData: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: [4, 5, 3][i % 3] })), scores: { p101_h6: 6, p103_h7: 5 } };
function regCtx(extra) {
    const proposed = [];
    const c = Object.assign({ round: ROUND, hole: 7, me: '101', role: 'playing', ent: { gps: true },
        proposeScores: (list, opts) => { proposed.push({ list, opts }); },
        yardage: () => ({ front: 140, middle: 152, back: 165, playsLike: 158, units: 'yd' }) }, extra || {});
    return { c, proposed };
}
function stubPlugin(o) {
    o = o || {};
    const calls = [], listeners = {}, replies = [];
    const p = {
        available: () => Promise.resolve({ available: true, onDevice: true }),
        requestPermission: () => { calls.push('perm'); return Promise.resolve(o.perm || { speech: 'granted', mic: 'granted' }); },
        start: (a) => { calls.push(['start', a]); return o.start ? o.start() : Promise.resolve({ ok: true, text: o.text || 'a 5 two putts', onDevice: true }); },
        stop: () => { calls.push('stop'); return Promise.resolve(); },
        cancel: () => { calls.push('cancel'); return Promise.resolve(); },
        intentReply: (r) => { replies.push(r); return Promise.resolve(); },
        held: () => Promise.resolve({ items: o.held || [] }),
        clearHeld: (a) => { calls.push(['clearHeld', a.id]); return Promise.resolve(); },
        addListener: (ev, fn) => { listeners[ev] = fn; return { remove() {} }; }
    };
    return { p, calls, listeners, replies };
}
const tick = () => new Promise((r) => setImmediate(r));

test('ONE registry def: voice, a dock button on the round screen, off by default, free; available only with the plugin', () => {
    const { V, W } = load();
    const q = W.HardPanFeatureQueue;
    assert.ok(Array.isArray(q) && q.length === 1, 'one def pushed onto HardPanFeatureQueue');
    const d = q[0];
    assert.equal(d, V.feature);
    assert.match(d.id, /^[a-z][a-zA-Z0-9]{1,31}$/);
    assert.equal(d.id, 'voice'); assert.equal(d.kind, 'button'); assert.equal(d.slot, 'dock');
    assert.deepEqual(d.screens, ['round']); assert.equal(d.defaultOn, false); assert.equal(d.tier, 'free'); assert.equal(d.isNew, true);
    assert.ok(d.label && d.sub && d.icon);
    assert.equal(d.available(), false, 'the web: no plugin, hidden');
    assert.equal(d.unlocked({}), true);
    const s = stubPlugin(); V._plugin(s.p);
    assert.equal(d.available(), true, 'the app: the plugin is there');
    const m = d.mount(null, regCtx().c);
    assert.equal(typeof m.update, 'function'); assert.equal(typeof m.unmount, 'function');
    // a queue made before this file loaded keeps what it had
    const pre = load({ queue: [{ id: 'scan' }] }).W.HardPanFeatureQueue;
    assert.deepEqual(pre.map((x) => x.id), ['scan', 'voice']);
});

test('start() with a stubbed transcript -> the normal score sheet, pre-filled (ctx.proposeScores); nothing saved here', async () => {
    const { V } = load();
    const { c, proposed } = regCtx();
    V.feature.mount(null, c);
    const st = await V.start({ transcript: 'Put me down for a 5, two putts' });
    assert.equal(st.phase, 'proposed');
    assert.deepEqual(proposed, [{ list: [{ pid: '101', hole: 7, strokes: 5, putts: 2 }], opts: { source: 'voice' } }]);
    // a golfer by name; no putts said = no putts proposed
    await V.start({ transcript: 'bogey for Dave' });
    assert.deepEqual(proposed[1].list, [{ pid: '103', hole: 7, strokes: 5 }], 'hole 7 is a par 4 in this round: bogey = 5');
    assert.equal(V.state().result.was, 5, 'Dave has a 5 there now (the sheet will show the change)');
    // the hole and its par from the round
    await V.start({ transcript: 'birdie on 8' });
    assert.deepEqual(proposed[2].list, [{ pid: '101', hole: 8, strokes: 4 }], 'hole 8 is a par 5');
    // "same as last hole": my 6 on hole 6
    await V.start({ transcript: 'same as last hole' });
    assert.deepEqual(proposed[3].list, [{ pid: '101', hole: 7, strokes: 6 }]);
    // a golfer who is Out is not offered
    await V.start({ transcript: 'Out got a 4' });
    assert.equal(proposed.length, 4, 'nothing proposed for a golfer who is Out');
    assert.equal(V.state().phase, 'ask');
});

test('no mounted ctx (before the registry mounts us): the hardpan:propose-scores event, same payload', async () => {
    const { V, events } = load();
    V.setContext(() => ({ code: 'T066', hole: 7, par: 4, golfers: [{ id: '101', name: 'Manny Test' }], me: '101', prev: {} }));
    const st = await V.start({ transcript: 'a 4' });
    assert.equal(st.phase, 'proposed');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'hardpan:propose-scores');
    assert.deepEqual(events[0].detail, { scores: [{ pid: '101', hole: 7, strokes: 4 }], source: 'voice' });
});

test('never a guess: a question, then the pick answers it', async () => {
    const { V } = load();
    const r2 = Object.assign({}, ROUND, { players: ROUND.players.concat([{ id: '105', name: 'Mike Other' }]) });
    const { c, proposed } = regCtx({ round: r2 });
    V.feature.mount(null, c);
    let st = await V.start({ transcript: 'Mike got a 5' });
    assert.equal(st.phase, 'ask'); assert.equal(st.result.reason, 'which-golfer');
    assert.equal(proposed.length, 0, 'nothing proposed while unsure');
    V.choose({ id: '105', name: 'Mike Other' });
    assert.deepEqual(proposed[0].list, [{ pid: '105', hole: 7, strokes: 5 }]);
    st = await V.start({ transcript: 'Bob got a 6' });
    assert.equal(st.result.reason, 'unknown-golfer');
    V.choose({ id: '102' });
    assert.deepEqual(proposed[1].list, [{ pid: '102', hole: 7, strokes: 6 }], 'Bob -> the golfer picked, the same 6');
    for (const t of ['a 5 or a 6', '52 putts', 'two putts', 'birdie 5']) {
        st = await V.start({ transcript: t });
        assert.equal(st.phase, 'ask', t);
    }
    assert.equal(proposed.length, 2);
    st = await V.start({ transcript: 'cancel' });
    assert.equal(st.phase, 'idle');
});

test('a watching phone (spectator) can’t score; no round open says so', async () => {
    let { V } = load();
    const { c, proposed } = regCtx({ role: 'watching' });
    V.feature.mount(null, c);
    const st = await V.start({ transcript: 'a 5' });
    assert.equal(st.result.reason, 'cannot-score'); assert.equal(proposed.length, 0);
    ({ V } = load());
    const s2 = await V.start({ transcript: 'a 5' });
    assert.equal(s2.phase, 'error'); assert.match(s2.msg, /Open your round/);
});

test('the microphone: permission first; denied = a plain message, no listening; the words come in; cancel stops it', async () => {
    let { V } = load({ native: true });
    let s = stubPlugin({ text: 'bogey two putts' });
    V._plugin(s.p);
    const { c, proposed } = regCtx();
    V.feature.mount(null, c);
    let st = await V.start();
    assert.equal(s.calls[0], 'perm');
    assert.equal(s.calls[1][0], 'start');
    assert.ok(s.calls[1][1].contextualStrings.includes('Mike'), 'the golfers’ names help the recognizer');
    assert.deepEqual(proposed[0].list, [{ pid: '101', hole: 7, strokes: 5, putts: 2 }]);
    // denied
    ({ V } = load({ native: true })); s = stubPlugin({ perm: { speech: 'denied', mic: 'granted' } }); V._plugin(s.p); V.feature.mount(null, c);
    st = await V.start();
    assert.equal(st.phase, 'denied'); assert.match(st.msg, /Settings/);
    assert.ok(!s.calls.some((x) => Array.isArray(x) && x[0] === 'start'), 'never listens without permission');
    // cancel while listening
    ({ V } = load({ native: true }));
    let release; s = stubPlugin({ start: () => new Promise((r) => { release = r; }) }); V._plugin(s.p); V.feature.mount(null, c);
    const p = V.start(); await tick(); await tick();
    assert.equal(V.state().phase, 'listening');
    V.stop(); assert.ok(s.calls.includes('stop'), 'push-to-talk released');
    V.cancel(); assert.ok(s.calls.includes('cancel'));
    release({ ok: true, text: 'a 5' }); await p; await tick();
    assert.equal(proposed.length, 1, 'cancelled: the late words are not proposed');
    // the recognizer heard nothing
    ({ V } = load({ native: true })); s = stubPlugin({ start: () => Promise.resolve({ ok: false, why: 'nothing' }) }); V._plugin(s.p); V.feature.mount(null, c);
    st = await V.start(); assert.equal(st.phase, 'error');
    // the web: no plugin
    ({ V } = load());
    st = await V.start(); assert.equal(st.phase, 'unavailable');
});

test('Siri: a score is proposed and Siri says what it put up; questions go back; yardage from ctx.yardage(); stale intents ignored', async () => {
    const { V } = load({ native: true });
    const s = stubPlugin(); V._plugin(s.p);
    const { c, proposed } = regCtx();
    V.feature.mount(null, c);
    const fire = (ev) => s.listeners.voiceIntent(Object.assign({ id: 'i' + s.replies.length, at: Date.now() }, ev));
    fire({ kind: 'score', words: 'a 5, two putts' });
    assert.deepEqual(proposed[0].list, [{ pid: '101', hole: 7, strokes: 5, putts: 2 }]);
    assert.equal(s.replies[0].status, 'proposed');
    assert.match(s.replies[0].say, /You, a 5 \(bogey\) on hole 7, 2 putts\. It’s on your screen/);
    fire({ kind: 'score', words: 'a 5 or 6' });
    assert.equal(s.replies[1].status, 'ask'); assert.equal(proposed.length, 1);
    fire({ kind: 'yardage' });
    assert.deepEqual([s.replies[2].status, s.replies[2].say], ['ok', '152 yards to the middle, 140 front, 165 back. Plays 158.']);
    fire({ kind: 'score', words: "what's my yardage" });
    assert.equal(s.replies[3].status, 'ok');
    // an intent Siri already gave up on (the page was asleep): ignored - the plugin held it
    s.listeners.voiceIntent({ id: 'old', at: Date.now() - 60000, kind: 'score', words: 'a 4' });
    assert.equal(s.replies.length, 4); assert.equal(proposed.length, 1);
    // no round: says so
    const { V: V2 } = load({ native: true }); const s2 = stubPlugin(); V2._plugin(s2.p);
    s2.listeners.voiceIntent({ id: 'x', at: Date.now(), kind: 'score', words: 'a 4' });
    assert.equal(s2.replies[0].status, 'noround');
});

test('words Siri held while the page slept: proposed on their hole; with no hole the golfer picks it', async () => {
    let { V } = load({ native: true });
    let s = stubPlugin({ held: [{ id: 'h1', words: 'a 4 two putts', at: Date.now() - 60000, hole: 5, round: 'T066' }] }); V._plugin(s.p);
    let rc = regCtx(); V.feature.mount(null, rc.c);
    await V.held();
    assert.deepEqual(rc.proposed[0].list, [{ pid: '101', hole: 5, strokes: 4, putts: 2 }]);
    assert.deepEqual(s.calls.filter((x) => Array.isArray(x) && x[0] === 'clearHeld'), [['clearHeld', 'h1']], 'used once, then cleared');
    // another round's words are not used here; old words are dropped
    ({ V } = load({ native: true }));
    s = stubPlugin({ held: [{ id: 'h2', words: 'a 4', at: Date.now(), round: 'OTHER' }, { id: 'h3', words: 'a 4', at: Date.now() - 3 * 3600 * 1000 }] }); V._plugin(s.p);
    rc = regCtx(); V.feature.mount(null, rc.c);
    assert.equal(await V.held(), null); assert.equal(rc.proposed.length, 0);
    // no hole known: asked, never guessed
    ({ V } = load({ native: true }));
    s = stubPlugin({ held: [{ id: 'h4', words: 'bogey', at: Date.now() }] }); V._plugin(s.p);
    rc = regCtx(); V.feature.mount(null, rc.c);
    await V.held();
    assert.equal(V.state().phase, 'ask');
    assert.deepEqual(V.state().result.choices, [{ hole: 6 }, { hole: 7 }]);
    assert.equal(rc.proposed.length, 0);
    V.choose({ hole: 6 });
    assert.deepEqual(rc.proposed[0].list, [{ pid: '101', hole: 6, strokes: 4 }], 'bogey on 6 (a par 3)');
});

test('yardage words: the GPS numbers; plays-like only for the one-leg (no target) case', () => {
    const { V } = load();
    assert.equal(V._yardageWords({ front: 504, middle: 520, back: 535, playsLike: 512, units: 'yd' }).say, '520 yards to the middle, 504 front, 535 back. Plays 512.');
    assert.equal(V._yardageWords({ middle: 150, units: 'm' }).say, '150 meters to the middle.');
    assert.equal(V._yardageWords({ middle: null }).ok, false);
    // a target is set: toGreen is the target -> green leg (288 here), never read as the golfer's plays-like
    assert.equal(V._greenLeg({ single: false, toTarget: { yards: 230, plays: 232 }, toGreen: { yards: 290, plays: 288 } }), null);
    assert.deepEqual(V._greenLeg({ single: true, toTarget: null, toGreen: { yards: 520, plays: 512 } }), { yards: 520, plays: 512 });
});

test('nothing leaves the phone: no network, position, database or score write in the voice files', () => {
    const strip = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    const js = strip('gps-voice.js') + strip('gps-voice-parse.js');
    assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|geolocation|watchPosition|getCurrentPosition|firebase|\.ref\(|\bdb\b\.|durableWrite|saveScore\(|localStorage\.setItem|HardPanGpsStats\.quick\.set/);
    const ios = path.join(__dirname, 'gps-beta/ios/App/PhoneBridge');
    const sw = fs.readFileSync(path.join(ios, 'HardPanVoicePlugin.swift'), 'utf8') + fs.readFileSync(path.join(ios, 'HardPanVoiceIntents.swift'), 'utf8');
    assert.doesNotMatch(sw, /URLSession|URLRequest|CLLocation|latitude|longitude|AVAudioRecorder|write\(to|FileManager/);
    // the held Siri words carry the hole and the round code from the Lock Screen numbers - never a position
    assert.match(sw, /la\["hole"\]/); assert.doesNotMatch(sw, /green\[|\["c"\]/);
});
