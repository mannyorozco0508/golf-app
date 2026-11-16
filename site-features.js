// ============================================================================
// THE HOMEPAGE FEATURE ROWS (website-e, Manny's picks 37B + 38C, Nov 10)
//
// hardpan-home.html shows the app's 25 features as five rows (Play, Games,
// Your group, Organize, Get better) of App-Store-style cards that swipe
// sideways. This script adds, on top of that plain HTML (which works without it):
//   1. Rows: the dots under each row follow the swipe; on a wide screen the
//      arrows scroll the row by one card.
//   2. The full-screen viewer (idea 1): tap a card (or press Enter on it) and
//      its screen opens full size - a sharp still, or the clip for the six
//      features that have one (played once, holding its last frame, never with
//      reduce motion). Swipe or use the arrows / arrow keys between features;
//      tap the picture to zoom (pinch zoom is the browser's own). Close with
//      the X, Esc, or the phone's Back button (the viewer adds one history
//      entry and takes it back on close). Focus stays inside while it is open
//      and returns to the card after.
//   3. Try the GPS (idea 3): Dobson Ranch hole 7. Nov 11 (Manny): Esri World
//      Imagery loaded live with the WEBSITE's own key (site-esri-config.js, the
//      only file that holds it; referrer-locked to hardpangolf.com), credited
//      "Powered by Esri" on the box. 16 z19 tiles on the same Web Mercator grid
//      as before, so the scale and the yards are unchanged; the HTML has no tile
//      URL, this file builds each one from the config. Was (Option D, Nov 10):
//      an inline OpenStreetMap SVG with no outside request. A tile that fails
//      (or a missing key) is hidden and the outline, lines and yards still draw
//      on the green ground. Nothing else leaves the page. A tap
//      (or the arrow keys) puts a target there and shows the yards from the
//      "you" dot (on the tee) to the target and from the target to the middle
//      of the green, measured on the map (metres per pixel in data-mpp).
//      No location is asked for.
//   4. Try Just say it (idea 4): the sentence typed is matched against a small
//      table of sentences, and the card shown is the one the app's own parser
//      (ask-hardpan.js askParse, dev-204) builds for that sentence for the
//      golfers Sam (you), Josh, Bob and Paul on hole 4. Nothing is saved and
//      nothing is sent: no fetch, no storage, no form submit.
// The clips themselves (load in view, play once, hold) are site-clips.js.
// Not part of the app: not in sw.js's shell list, not in the native bundle.
// ============================================================================
(function () {
    'use strict';
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
    var $ = function (id) { return document.getElementById(id); };
    var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

    // ---- 1. ROWS ---------------------------------------------------------------
    each(document.querySelectorAll('.grp'), function (g) {
        var row = g.querySelector('.row'), dots = g.querySelectorAll('.dots i'), cards = row.querySelectorAll('.fc');
        function step() { return cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : row.clientWidth; }
        function sync() {
            var i = Math.round(row.scrollLeft / Math.max(1, step()));
            if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 4) i = cards.length - 1;
            each(dots, function (d, k) { d.className = k === Math.min(i, cards.length - 1) ? 'on' : ''; });
        }
        row.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
        each(g.querySelectorAll('.ga'), function (b) {
            b.addEventListener('click', function () {
                row.scrollBy({ left: Number(b.getAttribute('data-dir')) * step(), behavior: reduce ? 'auto' : 'smooth' });
            });
        });
    });

    // ---- 2. THE VIEWER -----------------------------------------------------------
    var fv = $('fv'), track = $('fv-track');
    var items = [];
    each(document.querySelectorAll('.grp'), function (g) {
        var name = g.querySelector('.ghd h2').textContent, cs = g.querySelectorAll('.fc');
        each(cs, function (c, k) {
            var img = c.querySelector('.ph img'), vid = c.querySelector('.ph video');
            var set = (img.getAttribute('srcset') || '').split(',').map(function (s) { return s.trim().split(' ')[0]; });
            items.push({ card: c, key: c.getAttribute('data-key'), group: name, n: k + 1, of: cs.length, title: c.querySelector('h3').textContent,
                full: set[set.length - 1] || img.getAttribute('src'), alt: img.getAttribute('alt'),
                w: img.getAttribute('width'), h: img.getAttribute('height'), clip: vid ? vid.getAttribute('data-src') : null,
                fit: c.querySelector('.ph .s.fit') ? c.querySelector('.ph .s').style.background : '' });
        });
    });
    // HOMEPAGE A (Nov 15): the pictures the rows do not have (the scene sheets' [data-shot] buttons: media/home/) are viewer
    // items too, after the cards, grouped by their sheet. A wide one (the TV board) gets a 16:9 slide.
    (function () {
        var shots = document.querySelectorAll('[data-shot]'), byGroup = {};
        each(shots, function (b) { var g = b.getAttribute('data-group') || 'More'; (byGroup[g] = byGroup[g] || []).push(b); });
        Object.keys(byGroup).forEach(function (g) {
            byGroup[g].forEach(function (b, k) {
                var img = b.querySelector('img');
                var set = (img.getAttribute('srcset') || '').split(',').map(function (s) { return s.trim().split(' ')[0]; });
                items.push({ card: null, key: b.getAttribute('data-shot'), group: g, n: k + 1, of: byGroup[g].length, title: b.querySelector('b').textContent,
                    full: set[set.length - 1] || img.getAttribute('src'), alt: img.getAttribute('alt'),
                    w: img.getAttribute('width'), h: img.getAttribute('height'), clip: null, fit: '', wide: b.hasAttribute('data-wide') });
            });
        });
    })();
    var cur = -1, opener = null, built = false, ourState = false, ignorePop = false;

    function build() {
        if (built) return; built = true;
        items.forEach(function (it, i) {
            var li = document.createElement('li');
            li.className = 'fv-s'; li.setAttribute('data-i', i);
            li.setAttribute('aria-roledescription', 'slide');
            li.setAttribute('aria-label', it.group + ' ' + it.n + ' of ' + it.of + ': ' + it.title);
            var box = document.createElement('div');
            box.className = 'fv-img' + (it.fit ? ' fit' : '') + (it.wide ? ' wide' : '');
            if (it.fit) box.style.background = it.fit;
            li.appendChild(box);
            track.appendChild(li);
        });
    }
    function fill(i) {   // load a slide's picture only when it is the current one or next to it
        var it = items[i], li = track.children[i];
        if (!it || !li || li.getAttribute('data-filled')) return;
        li.setAttribute('data-filled', '1');
        var box = li.firstChild;
        if (it.clip && !reduce) {
            var v = document.createElement('video');
            v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.preload = 'none';
            v.setAttribute('poster', it.full); v.setAttribute('aria-label', it.alt);
            v.setAttribute('data-vsrc', it.clip);
            box.appendChild(v);
        } else {
            var im = document.createElement('img');
            im.src = it.full; im.alt = it.alt; im.width = it.w; im.height = it.h; im.decoding = 'async';
            box.appendChild(im);
        }
    }
    function playCurrent() {
        each(track.querySelectorAll('video'), function (v) {
            var li = v.closest('.fv-s');
            if (Number(li.getAttribute('data-i')) === cur) {
                if (!v.getAttribute('src')) { v.addEventListener('error', function () { v.removeAttribute('src'); }); v.src = v.getAttribute('data-vsrc'); }
                if (!v.ended) { var p = v.play(); if (p && p.catch) p.catch(function () { /* the still stays */ }); }
            } else if (!v.paused) v.pause();
        });
    }
    function show(i, smooth) {
        if (i < 0 || i >= items.length) return;
        cur = i;
        [i - 1, i, i + 1].forEach(fill);
        var it = items[i];
        $('fv-n').textContent = it.group + ' · ' + it.n + ' / ' + it.of;
        $('fv-title').textContent = it.title;
        $('fv-prev').disabled = i === 0; $('fv-next').disabled = i === items.length - 1;
        var li = track.children[i];
        track.scrollTo({ left: li.offsetLeft, behavior: smooth && !reduce ? 'smooth' : 'auto' });
        playCurrent();
    }
    function open(i, from) {
        build();
        opener = from || null;
        fv.hidden = false; fv.removeAttribute('hidden'); fv.style.display = 'flex';
        document.documentElement.classList.add('fv-open');
        show(i, false);
        try { history.pushState({ hpViewer: true }, ''); ourState = true; } catch (e) { ourState = false; }
        $('fv-x').focus();
    }
    function close(fromPop) {
        if (fv.hidden) return;
        each(track.querySelectorAll('video'), function (v) { v.pause(); });
        each(track.querySelectorAll('.fv-img.zoom'), function (b) { b.classList.remove('zoom'); });
        fv.hidden = true; fv.style.display = '';
        document.documentElement.classList.remove('fv-open');
        if (!fromPop && ourState) { ignorePop = true; try { history.back(); } catch (e) { ignorePop = false; } }
        ourState = false;
        if (opener && opener.focus) opener.focus();
    }
    window.addEventListener('popstate', function () {
        if (ignorePop) { ignorePop = false; return; }
        if (!fv.hidden) close(true);
    });
    each(document.querySelectorAll('.fc'), function (c) {
        var b = c.querySelector('.ph');
        var i = items.map(function (x) { return x.card; }).indexOf(c);
        c.addEventListener('click', function (ev) { ev.preventDefault(); open(i, b); });
    });
    // HOMEPAGE A: anything with data-open-key opens the viewer at that feature (a tile in "at a glance", a picture in a scene sheet).
    function openKey(key, from) {
        var i = -1;
        items.some(function (x, k) { if (x.key === key) { i = k; return true; } return false; });
        if (i >= 0) open(i, from);
        return i >= 0;
    }
    // ADVISOR-20261115-2015 (Manny, iPhone Chrome: the lower tiles "don't lead to anything"; not reproduced in Chrome's touch
    // emulation, and WebKit cannot be driven on the Mac): the tile opens on the finger's touchend as well as on click, the second
    // of the pair within 700 ms being ignored, and the viewer is shown by removing hidden AND setting display, so neither a
    // swallowed click nor a stale [hidden] style leaves a dead tile. Mouse and keyboard still arrive as click.
    var lastKeyTap = 0;
    function tileHit(ev) {
        var b = ev.target && ev.target.closest && ev.target.closest('[data-open-key]');
        if (!b) return;
        var now = Date.now();
        if (now - lastKeyTap < 700) { ev.preventDefault(); return; }
        lastKeyTap = now;
        ev.preventDefault();
        openKey(b.getAttribute('data-open-key'), b);
    }
    document.addEventListener('click', tileHit);
    document.addEventListener('touchend', tileHit, { passive: false });
    $('fv-x').addEventListener('click', function () { close(false); });
    $('fv-prev').addEventListener('click', function () { show(cur - 1, true); });
    $('fv-next').addEventListener('click', function () { show(cur + 1, true); });
    var settle;
    track.addEventListener('scroll', function () {   // a swipe: the slide nearest the middle becomes current
        clearTimeout(settle);
        settle = setTimeout(function () {
            var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
            if (i !== cur && i >= 0 && i < items.length) {
                cur = i; [i - 1, i, i + 1].forEach(fill);
                var it = items[i];
                $('fv-n').textContent = it.group + ' · ' + it.n + ' / ' + it.of;
                $('fv-title').textContent = it.title;
                $('fv-prev').disabled = i === 0; $('fv-next').disabled = i === items.length - 1;
                playCurrent();
            }
        }, 120);
    }, { passive: true });
    track.addEventListener('click', function (ev) {   // tap the picture: zoom in / out
        var box = ev.target.closest && ev.target.closest('.fv-img');
        if (box) box.classList.toggle('zoom');
    });
    fv.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); close(false); }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); show(cur + 1, true); }
        else if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(cur - 1, true); }
        else if (ev.key === 'Tab') {   // keep focus inside the viewer
            var f = [$('fv-x'), $('fv-prev'), $('fv-next')].filter(function (x) { return !x.disabled; });
            var k = f.indexOf(document.activeElement);
            ev.preventDefault();
            f[(k + (ev.shiftKey ? -1 : 1) + f.length) % f.length].focus();
        }
    });

    // ---- 2a. A NEW RELEASE REACHES A TAB THAT IS ALREADY OPEN (ADVISOR-20261116-0049) ----------------------------------
    // Manny's iPhone kept showing an old homepage in a tab it had open since before a deploy; the tiles it had were the
    // old ones. functions/_front-door.js now serves `/` with the deploy's build in Server-Timing (build;desc=<sha>) and
    // X-HardPan-Build. This remembers the build the page was loaded from (the navigation entry's serverTiming; where that
    // is not readable, the first HEAD answer) and, whenever the tab comes back to the front (visibilitychange, pageshow
    // from the back-forward cache, online), at most once a minute, asks `/` with a HEAD (cache: no-store; the service
    // worker never intercepts a HEAD) for the build now live. A different build reloads the page, unless the viewer or a
    // sheet is open: then the reload waits for the next return. Nothing is polled while the tab is in front. A visitor on
    // a page the Function did not stamp (a local file, a very old deploy) sees 'dev' or '' and nothing ever reloads.
    (function () {
        var loaded = '';
        try {
            var nav = performance.getEntriesByType('navigation')[0];
            (nav && nav.serverTiming || []).forEach(function (t) { if (t.name === 'build' && t.description) loaded = t.description; });
        } catch (e) { /* no timing entry: the first HEAD answer is the baseline */ }
        var last = 0, busy = false;
        function liveBuild() {
            return fetch(location.pathname + location.search, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' })
                .then(function (r) { return r.ok ? (r.headers.get('X-HardPan-Build') || '') : ''; })
                .catch(function () { return ''; });
        }
        function check() {
            if (document.visibilityState === 'hidden' || busy) return;
            var now = Date.now();
            if (now - last < 60000) return;
            last = now; busy = true;
            liveBuild().then(function (b) {
                busy = false;
                if (!b || b === 'dev') return;
                if (!loaded) { loaded = b; return; }
                if (b === loaded) return;
                var fvEl = document.getElementById('fv');
                if ((fvEl && !fvEl.hidden) || document.querySelector('.sheet:not([hidden])')) { last = 0; return; }
                location.reload();
            });
        }
        document.addEventListener('visibilitychange', check);
        window.addEventListener('pageshow', function (ev) { if (ev.persisted) { last = 0; check(); } });
        window.addEventListener('online', function () { last = 0; check(); });
        window.__hpLoadedBuild = function () { return loaded; };   // read by the guard; nothing on the page calls it
    })();

    // ---- 2b. THE SCENE SHEETS (homepage A, Nov 15) -------------------------------------
    // A mosaic tile or a scene card ([data-sheet="x"]) opens #sheet-x: that scene's pictures as thumbnails, each a
    // [data-open-key] button into the viewer above (which stacks over the sheet; closing it returns focus to the thumbnail).
    // X, Esc or a tap on the dark backdrop closes the sheet and focus returns to what opened it. One sheet at a time.
    var sheetOpener = null;
    function closeSheet() {
        var s = document.querySelector('.sheet:not([hidden])');
        if (!s) return;
        s.hidden = true;
        document.documentElement.classList.remove('sheet-open');
        if (sheetOpener && sheetOpener.focus) sheetOpener.focus();
        sheetOpener = null;
    }
    document.addEventListener('click', function (ev) {
        if (!ev.target.closest) return;
        var t = ev.target.closest('[data-sheet]');
        if (t) {
            var s = $('sheet-' + t.getAttribute('data-sheet'));
            if (!s) return;
            ev.preventDefault();
            closeSheet();
            sheetOpener = t;
            s.hidden = false;
            document.documentElement.classList.add('sheet-open');
            var x = s.querySelector('.sh-x'); if (x) x.focus();
            return;
        }
        if (ev.target.closest('.sh-x') || (ev.target.classList && ev.target.classList.contains('sheet'))) closeSheet();
    });
    // Esc with the viewer open closes the viewer only (its own handler above; the key bubbles up from inside it with
    // fv already hidden, so the sheet must not read that same key): the sheet closes on the NEXT Esc.
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && fv.hidden && !fv.contains(ev.target)) closeSheet(); });

    // ---- 2c. THE STICKY BAR (F2, Nov 15) -------------------------------------------
    // The brand sits on the fold (the lockup over the phone fan); once #top has scrolled past, #stick slides in with the
    // small lockup, the links and Get the app, and slides out again when the fold is back. No observer = no bar.
    var stick = $('stick'), top = $('top');
    if (stick && top && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { es.forEach(function (e) { stick.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0); }); }, { threshold: 0 }).observe(top);
    }

    // ---- 3. TRY THE GPS ----------------------------------------------------------
    var map = $('tg-map');
    if (map) {
        // The Esri tiles (Nov 11): src built from site-esri-config.js (the website's key); one that
        // fails is hidden (the green ground and the outline stay); data-tiles says how many are missing.
        var cfg = window.HP_SITE_ESRI, tiles = map.querySelectorAll('.tile');
        var miss = function () { map.setAttribute('data-tiles', map.querySelectorAll('.tile.err').length + ' of ' + tiles.length + ' missing'); };
        each(tiles, function (im) {
            im.addEventListener('error', function () { im.classList.add('err'); miss(); });
            if (!cfg || !cfg.key || !cfg.tiles) { im.classList.add('err'); return; }
            im.src = cfg.tiles.replace('{z}', '19').replace('{y}', im.getAttribute('data-y')).replace('{x}', im.getAttribute('data-x'))
                .replace('{key}', encodeURIComponent(cfg.key));
        });
        if (!cfg || !cfg.key) miss();
        var num = function (s) { return s.split(',').map(Number); };
        var MPP = Number(map.getAttribute('data-mpp')), W = Number(map.getAttribute('data-w')), H = Number(map.getAttribute('data-h'));
        var YOU = num(map.getAttribute('data-you')), MID = num(map.getAttribute('data-mid'));
        var tap = null;
        var yards = function (a, b) { return Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * MPP / 0.9144); };
        var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
        var at = function (el, p) { el.style.left = clamp(100 * p[0] / W, 16, 84) + '%'; el.style.top = clamp(100 * p[1] / H, 9, 93) + '%'; };
        var setLine = function (l, a, b) { l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]); };
        var measure = function (p) {
            tap = [Math.max(0, Math.min(W, p[0])), Math.max(0, Math.min(H, p[1]))];
            var a = yards(YOU, tap), b = yards(tap, MID);
            setLine($('tg-l1'), YOU, tap); setLine($('tg-l2'), tap, MID);
            var t = $('tg-t'); t.setAttribute('cx', tap[0]); t.setAttribute('cy', tap[1]); t.setAttribute('visibility', 'visible');
            var A = $('tg-a'); A.hidden = false; A.querySelector('b').textContent = a + ' y';
            at(A, [(YOU[0] + tap[0]) / 2, (YOU[1] + tap[1]) / 2]);
            $('tg-bn').textContent = b + ' y'; $('tg-bl').textContent = 'to middle';
            at($('tg-b'), [(tap[0] + MID[0]) / 2, (tap[1] + MID[1]) / 2]);
            $('tg-read').textContent = a + ' y from you to the target, then ' + b + ' y from the target to the middle of the green.';
            map.setAttribute('data-yards', a + ',' + b);
        };
        map.addEventListener('click', function (ev) {
            var r = map.getBoundingClientRect();
            measure([(ev.clientX - r.left) * W / r.width, (ev.clientY - r.top) * H / r.height]);
        });
        map.addEventListener('keydown', function (ev) {
            var d = { ArrowUp: [0, -10], ArrowDown: [0, 10], ArrowLeft: [-10, 0], ArrowRight: [10, 0] }[ev.key];
            if (!d && ev.key !== 'Enter' && ev.key !== ' ') return;
            ev.preventDefault();
            var p = tap || [(YOU[0] + MID[0]) / 2, (YOU[1] + MID[1]) / 2];
            measure(d ? [p[0] + d[0], p[1] + d[1]] : p);
        });
    }

    // ---- 4. TRY JUST SAY IT --------------------------------------------------------
    // Each entry: the card the app's parser builds for that sentence (see the header).
    var SAY = [
        {"text":"Me & Josh vs Bob & Paul, best ball for fun","says":["me and josh vs bob and paul best ball for fun","sam and josh vs bob and paul best ball for fun"],"title":"2 v 2 Best Ball","lines":[["Sides","Sam + Josh vs Bob + Paul"],["Amount","No amount"],["Presses","Off"],["Scoring","Net"],["Counts from","Hole 4 (now)"]],"start":"Start game"},
        {"text":"Me vs Josh, Nassau, for fun","says":["me vs josh nassau for fun","nassau me vs josh for fun","sam vs josh nassau for fun"],"title":"1 v 1 Nassau","lines":[["Sides","Sam vs Josh"],["Amount","No amount"],["Presses","Off"],["Scoring","Net"],["Counts from","Hole 4 (now)"]],"start":"Start game"},
        {"text":"Skins for everyone, for fun","says":["skins for everyone for fun","skins everyone for fun","everyone skins for fun"],"title":"Skins","lines":[["Who’s in","Everyone (4)"],["Amount","No amount"],["Scoring","Net"],["Counts from","Hole 4 (now)"],["Carry over","Off"]],"start":"Start game"},
        {"text":"Me vs Bob, match play, gross, from hole 1, for fun","says":["me vs bob match play gross from hole 1 for fun","match play me vs bob gross from hole 1 for fun","sam vs bob match play gross from hole 1 for fun"],"title":"1 v 1 Match Play","lines":[["Sides","Sam vs Bob"],["Amount","No amount"],["Presses","Off"],["Scoring","Gross"],["Counts from","Hole 1"]],"start":"Start game"},
        {"text":"Me & Josh vs Bob & Paul, Hi-Lo for fun","says":["me and josh vs bob and paul hi lo for fun","hi lo me and josh vs bob and paul for fun"],"title":"2 v 2 Hi-Lo","lines":[["Sides","Sam + Josh vs Bob + Paul"],["Amount","No amount"],["Scoring","Net"],["Counts from","Hole 4 (now)"]],"start":"Start game"}
    ];
    var form = $('ts-form');
    if (form) {
        var norm = function (t) {
            return String(t).toLowerCase().replace(/[’‘`]/g, "'").replace(/&/g, ' and ').replace(/\+/g, ' and ')
                .replace(/\bv\b|\bversus\b/g, 'vs').replace(/[^a-z0-9' -]+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        };
        var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        var cardHtml = function (r) {
            return '<div class="ak-head"><span class="ak-back" aria-hidden="true">‹</span><div class="ak-t">Add a game<small>From what you described</small></div></div>'
                + '<div class="ak-card"><div class="ak-ck">HERE’S WHAT I’LL SET UP</div><div class="ak-ct">' + esc(r.title) + '</div>'
                + r.lines.map(function (l) { return '<div class="ak-line"><span>' + esc(l[0]) + '</span><b>' + esc(l[1]) + '</b><i aria-hidden="true">›</i></div>'; }).join('')
                + '<div class="ak-note">Not quite right? Tap any line to change it.</div>'
                + '<div class="ak-btns" aria-hidden="true"><span class="ak-chg">Change</span><span class="ak-go">' + esc(r.start) + '</span></div></div>';
        };
        var run = function (text) {
            var n = norm(text), hit = null;
            SAY.forEach(function (r) { if (!hit && r.says.indexOf(n) > -1) hit = r; });
            $('ts-out').innerHTML = hit ? cardHtml(hit)
                : '<p class="ts-miss">This demo only knows the sentences above. The app reads many more ways to say a game.</p>';
            $('ts-out').setAttribute('data-said', hit ? hit.title : '');
        };
        form.addEventListener('submit', function (ev) { ev.preventDefault(); run($('ts-in').value); });
        each(document.querySelectorAll('#try-say .chipb'), function (b) {
            b.addEventListener('click', function () { $('ts-in').value = b.getAttribute('data-say'); run(b.getAttribute('data-say')); });
        });
    }
})();
