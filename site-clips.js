// ============================================================================
// THE FEATURE / HELP CLIP SLOTS (website-c, Manny's picks 27A and 28A)
//
// Every clip on the marketing pages is
//   <video muted playsinline preload="none" poster="/media/posters/X.jpg"
//          data-src="/media/clips/X.mp4">
// The poster is a real 2.0.4 still and is all a visitor sees until the clip
// file exists. This script:
//   - loads a clip only when its tile scrolls into view (nothing is fetched
//     for a tile that is never seen), then plays it muted, ONCE: there is no
//     loop attribute (website-d, Manny "keep option 1"), so at the end the
//     video stays on its last frame - nothing jumps back to the first frame,
//     and the poster (that clip's own first frame) does not come back. Back in
//     view after it ended, play() starts it again from the top;
//   - pauses it again when the tile leaves the screen;
//   - if the clip file is missing or will not play, drops the src so the
//     poster stays (no broken player, no spinner), and never asks again;
//   - with "reduce motion" on, never plays anything: posters only.
// The "clip" length tag on a tile is shown only once its clip is playing.
// The expected files and lengths are in media/clips/manifest.json.
// Not part of the app: not in sw.js's shell list, not in the native bundle.
// ============================================================================
(function () {
    'use strict';
    var vids = Array.prototype.slice.call(document.querySelectorAll('video[data-src]'));
    if (!vids.length) return;
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
    if (reduce || !('IntersectionObserver' in window)) return;   // posters only

    function giveUp(v) {
        v.setAttribute('data-clip', 'missing');
        v.removeAttribute('src');
        try { v.load(); } catch (e) { /* the poster is already showing */ }
    }

    function start(v) {
        var state = v.getAttribute('data-clip');
        if (state === 'missing') return;
        if (!state) {
            v.setAttribute('data-clip', 'loading');
            v.addEventListener('error', function () { giveUp(v); });
            v.addEventListener('playing', function () {
                v.setAttribute('data-clip', 'playing');
                if (v.parentNode) v.parentNode.classList.add('has-clip');
            });
            v.src = v.getAttribute('data-src');
        }
        var p = v.play();
        if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay refused: the poster stays */ });
    }

    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            var v = en.target;
            if (en.isIntersecting) start(v);
            else if (v.getAttribute('data-clip') && v.getAttribute('data-clip') !== 'missing') v.pause();
        });
    }, { rootMargin: '120px 0px', threshold: 0.25 });
    vids.forEach(function (v) { io.observe(v); });
})();
