// ============================================================================
// HARDPAN GPS - LOCK SCREEN + DYNAMIC ISLAND YARDAGES (mailbox 022 feature 1)
//
// The GPS screen hands this file its numbers on every render (gps-view.js render -> sync()).
// In the iOS app this starts ONE Live Activity for the round (the native HardPanLiveActivity
// plugin + the HardPanLiveActivity widget extension) and keeps it up to date:
//   Lock Screen   Hole N · Par · F / big MIDDLE / B · plays-like · "Thru 3 · 14 (+2)" · money
//                 (only when the round has bets)
//   Island        compact = the middle number; expanded = F / M / B + hole; minimal = middle
// THROTTLE (battery): a hole change goes at once; otherwise at most every 10 s, or sooner when the
// middle number moves 5+. A hidden page sends nothing - with the phone locked the plugin's own
// location keeps the numbers going (it has the green's three points, never sends a position).
// ENDS when the GPS closes (unmount / leaving the round page) or the switch is turned off.
// SWITCH: Tools › "Lock Screen yardages", per phone, default ON (hardpan_live_activity = 'off').
// On the web, or without the plugin: nothing at all.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var KEY = 'hardpan_live_activity', GAP_MS = 10000, MOVE = 5, MOVE_GAP_MS = 2000, WATCH_MS = 15000;
    var st = { running: false, starting: false, round: null, last: null, lastAt: 0, lastHole: null, lastMid: null, pending: null, timer: null, watch: null };
    var testPlugin = null;

    function native() { try { return !!(W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function' && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
    // ANDROID (android-2.0, 024 A3): no HardPanLiveActivity until the ongoing-notification step
    // (024 D5); registerPlugin() would hand back a stand-in whose calls all fail. There it counts
    // only when Capacitor says the plugin is really in the app. iOS keeps the path below.
    function android() { try { return W.Capacitor.getPlatform() === 'android'; } catch (e) { return false; } }
    function plugin() {
        if (testPlugin) return testPlugin;
        if (!native()) return null;
        var C = W.Capacitor;
        if (android() && !(typeof C.isPluginAvailable === 'function' && C.isPluginAvailable('HardPanLiveActivity'))) return null;
        try { return (C.Plugins && C.Plugins.HardPanLiveActivity) || (typeof C.registerPlugin === 'function' ? (C.__hpLA = C.__hpLA || C.registerPlugin('HardPanLiveActivity')) : null); } catch (e) { return null; }
    }
    function isOn() { try { return W.localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
    function setOn(on) {
        try { if (on) W.localStorage.removeItem(KEY); else W.localStorage.setItem(KEY, 'off'); } catch (e) {}
        if (!on) end('off');
        return isOn();
    }
    function hidden() { try { return !!(W.document && W.document.visibilityState === 'hidden'); } catch (e) { return false; } }
    function now() { return Date.now(); }

    // payload: { round, course, hole, par, front, mid, back, unit, playsDelta, fromTee, thru, money, green: { f, c, b } }
    function sync(p) {
        var pl = plugin();
        if (!pl || !p || !p.round || !(p.hole >= 1)) return false;
        if (!isOn()) { if (st.running) end('off'); return false; }
        watchMount();
        if (st.running && st.round !== p.round) end('round');
        if (!st.running) { if (!st.starting) begin(pl, p); return true; }
        if (hidden()) return false;
        var key = JSON.stringify(p);
        if (key === st.last) return false;
        var t = now(), holeChanged = p.hole !== st.lastHole;
        var moved = p.mid != null && st.lastMid != null ? Math.abs(p.mid - st.lastMid) >= MOVE : p.mid !== st.lastMid;
        if (holeChanged || (moved && t - st.lastAt >= MOVE_GAP_MS) || t - st.lastAt >= GAP_MS) { send(pl, p, key); return true; }
        // Not yet: the newest numbers go when the 10 s are up.
        st.pending = p;
        if (!st.timer) st.timer = setTimeout(function () { st.timer = null; var q = st.pending; st.pending = null; if (q && st.running) send(pl, q, JSON.stringify(q)); }, Math.max(0, GAP_MS - (t - st.lastAt)));
        return false;
    }
    function begin(pl, p) {
        st.starting = true;
        Promise.resolve(typeof pl.available === 'function' ? pl.available() : { available: true }).then(function (a) {
            if (!(a && a.available) || !isOn()) { st.starting = false; return null; }
            return Promise.resolve(pl.start(p)).then(function (r) {
                st.starting = false;
                if (!(r && r.started)) return;
                st.running = true; st.round = p.round; st.last = JSON.stringify(p); st.lastAt = now(); st.lastHole = p.hole; st.lastMid = p.mid;
            });
        }).then(null, function () { st.starting = false; });
    }
    function send(pl, p, key) {
        st.last = key; st.lastAt = now(); st.lastHole = p.hole; st.lastMid = p.mid;
        try { var r = pl.update(p); if (r && typeof r.then === 'function') r.then(null, function () {}); } catch (e) {}
    }
    function end(why) {
        var pl = plugin();
        if (st.timer) { clearTimeout(st.timer); st.timer = null; }
        var was = st.running || st.starting;
        st.running = false; st.starting = false; st.round = null; st.last = null; st.pending = null; st.lastHole = null; st.lastMid = null;
        if (pl && was) { try { var r = pl.end({ why: why || '' }); if (r && typeof r.then === 'function') r.then(null, function () {}); } catch (e) {} }
        return was;
    }
    // THE GPS CLOSED: the map unmounted (HardPanGps.isMounted false), or the page is going away.
    function watchMount() {
        if (st.watch) return;
        st.watch = setInterval(function () {
            var G = W.HardPanGps;
            if ((st.running || st.starting) && !(G && typeof G.isMounted === 'function' && G.isMounted())) end('gps closed');
        }, WATCH_MS);
        try { W.addEventListener('pagehide', function () { end('page'); }); } catch (e) {}
    }

    W.HardPanLiveActivity = {
        sync: sync, end: end, isOn: isOn, setOn: setOn,
        running: function () { return st.running; },
        // The plugin is in this app (android-2.0: the Lock Screen row shows only then on Android).
        here: function () { return !!plugin(); },
        GAP_MS: GAP_MS, MOVE: MOVE,
        _plugin: function (p) { testPlugin = p || null; },
        _reset: function () { if (st.timer) clearTimeout(st.timer); if (st.watch) clearInterval(st.watch); st = { running: false, starting: false, round: null, last: null, lastAt: 0, lastHole: null, lastMid: null, pending: null, timer: null, watch: null }; }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = W.HardPanLiveActivity;
})();
