// ============================================================================
// 096 - THE BUDDY PREVIEW GATE (Manny, Oct 28 2026). PREVIEW BUILD ONLY.
//
// Copied into the build ONLY by HARDPAN_BUDDY_PREVIEW=1 node tools/build-gps-app.js
// (the Cloudflare Pages preview "gps-buddy" on golf-app). It is never in the repo
// root, never in the iOS / Android app, never in production. Branch 096-buddy-preview
// only - never merge it.
//
// ONE WEEK: after Wed Nov 4, 2026 11:59 PM Arizona time (UTC-7, no DST) every page
// shows "This preview has ended. Thanks for testing HardPan!" and nothing else runs.
// The time: the server's Date header (a HEAD request to this site on each load;
// the difference to the phone clock is kept on this phone), the phone clock when
// the server has never been reached. The server side (functions/_middleware.js in
// the preview deploy) answers every request with the same page past the end.
//
// It is the FIRST script in every page's <head>, so when the preview has ended no
// other script on the page runs. It also turns on the app's two front doors
// (window.__hardpanDoors), so a phone browser gets the HardPan GPS app's Home
// (GPS | Games) the way the app does.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var END = 1793862000000;   // 2026-11-05T07:00:00Z = Thu Nov 5 12:00 AM Arizona: ended from this instant
    var KEY = 'hardpan_buddy_preview_offset';
    var MSG = 'This preview has ended. Thanks for testing HardPan!';
    W.__hardpanDoors = true;
    W.HardPanBuddyPreview = { end: END };

    function readOffset() { try { var v = W.localStorage.getItem(KEY); var o = v == null ? NaN : Number(v); return isFinite(o) ? o : null; } catch (e) { return null; } }
    function writeOffset(o) { try { W.localStorage.setItem(KEY, String(Math.round(o))); } catch (e) {} }
    function estNow() { var o = readOffset(); return Date.now() + (o == null ? 0 : o); }
    function ended(t) { return t >= END; }

    var shown = false;
    function showEnded() {
        if (shown) return;
        shown = true;
        try { W.stop(); } catch (e) {}
        var d = W.document;
        d.documentElement.innerHTML = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            + '<title>HardPan preview</title></head>'
            + '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;'
            + 'background:#f0f4f2;color:#0f4c3a;font:600 20px/1.4 -apple-system,system-ui,sans-serif;text-align:center">'
            + '<p id="buddy-preview-ended">' + MSG + '</p></body>';
    }
    W.HardPanBuddyPreview.ended = function () { return ended(estNow()); };

    // 1. NOW, before anything else on the page: the last known server time, else the phone clock.
    if (ended(estNow())) { showEnded(); }

    // 2. The server's clock (Date header). Ended -> reload (the server and step 1 then show the
    //    end page and nothing else starts). A wrong phone clock that said "ended" is corrected
    //    by the stored difference and the page reloads once into the app.
    var asking = false;
    function askServer() {
        if (asking || typeof fetch !== 'function') return;
        asking = true;
        var sent = Date.now();
        fetch('buddy-preview.js?t=' + sent, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
            asking = false;
            var h = r && r.headers && r.headers.get('Date');
            var server = h ? Date.parse(h) : NaN;
            if (!isFinite(server)) return;
            var back = Date.now();
            writeOffset(server - (sent + back) / 2);
            var isEnded = ended(estNow());
            if (isEnded !== shown) W.location.reload();
        }, function () { asking = false; });
    }
    askServer();

    // 3. A page left open past the end: checked every minute and when the phone comes back.
    setInterval(function () { if (!shown && ended(estNow())) W.location.reload(); }, 60000);
    W.document.addEventListener('visibilitychange', function () { if (W.document.visibilityState === 'visible') askServer(); });
})();
