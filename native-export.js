/* =============================================================================
 * NATIVE EXPORT — Print / Save on iOS, where window.print() does nothing.
 *
 * THE BUG THIS EXISTS FOR. Every "Print / Save PDF" and "Print / Save Receipt"
 * control called window.print(). Mobile Safari implements that; an embedded
 * WKWebView has no print controller wired to it, so the call returns silently -
 * no dialog, no error, nothing to catch. On TestFlight the Receipt rendered
 * perfectly and the button did nothing at all.
 *
 * WHAT THIS DOES NOT DO. It does not recalculate anything. The PDF is built by
 * reading the ALREADY-RENDERED DOM - the same nodes the golfer is looking at.
 * There is no second settlement path, and there cannot be one: if the Receipt is
 * wrong, the PDF is wrong in exactly the same way, which is the correct failure.
 * No protected engine is touched or even loaded by this file.
 *
 * WHY A HAND-WRITTEN PDF. The requirement was a genuinely valid PDF, not an HTML
 * file wearing a .pdf extension. A receipt is text in a monospaced column, so the
 * PDF this emits is deliberately small: PDF 1.4, one Helvetica font, one text
 * block per page. That is a few hundred bytes of writer instead of a megabyte of
 * library, and every byte of it is inspectable.
 *
 * BROWSER BEHAVIOUR IS UNCHANGED. On the web this file hands straight back to
 * window.print(), which already works and already has print CSS behind it,
 * including the dark-mode fix. Nothing about the PWA path moves.
 * ========================================================================== */
(function () {
    'use strict';

    // ---- NATIVE DETECTION: ONE MECHANISM, NOT A SECOND ONE ------------------
    //
    // pwa-boot.js already decides this - it is how the service worker knows not
    // to register inside Capacitor - and it exposes the answer as
    // GolfNet.isNative(). Re-deriving it here would create two ways to be wrong.
    function isNative() {
        try {
            return !!(window.GolfNet
                && typeof window.GolfNet.isNative === 'function'
                && window.GolfNet.isNative());
        } catch (e) {
            return false;
        }
    }

    // ---- IS THERE A NATIVE BRIDGE AT ALL? -----------------------------------
    //
    // Separate question from isNative(). If Capacitor is present but GolfNet says
    // "browser", something is misconfigured - which is exactly what shipped in
    // Build 4 - and the one thing we must NOT do is quietly call window.print()
    // and look like a dead button again.
    function bridgePresent() {
        try {
            const cap = window.Capacitor;
            if (!cap) return false;
            if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform();
            // Nothing here may hinge on registerPlugin: the native injected bridge
            // never defines it. A Plugins bag is the bridge's own fingerprint.
            return !!cap.Plugins || typeof cap.registerPlugin === 'function';
        } catch (e) {
            return false;
        }
    }

    // ---- RESOLVING THE PLUGINS ----------------------------------------------
    //
    // CAPACITOR HAS TWO JS RUNTIMES, AND THIS APP ONLY EVER SEES ONE OF THEM.
    //
    //   BUNDLER RUNTIME   the npm packages call registerPlugin('Filesystem') from
    //                     @capacitor/core, which builds a proxy. Every example in
    //                     the docs shows this. It needs an import pipeline.
    //
    //   NATIVE BRIDGE     what actually runs here. JSExport.swift injects a
    //                     WKUserScript at documentStart for every registered
    //                     plugin:  w.Capacitor.Plugins['Filesystem'] = { ... }
    //                     with one shim per CAPPluginMethod. No import, no
    //                     bundler, and NO registerPlugin - native-bridge.js does
    //                     not define it at all.
    //
    // Build 5 demanded registerPlugin and therefore refused to export on a device
    // where the plugins were sitting right there on Capacitor.Plugins, correctly
    // registered by Swift. Plugins FIRST is the production path; registerPlugin is
    // kept only so this still works if a bundler is ever introduced.
    let pluginCache;
    function nativePlugins() {
        if (pluginCache !== undefined) return pluginCache;
        pluginCache = null;
        try {
            const cap = window.Capacitor;
            if (!cap) return pluginCache;

            // 1. The native injected bridge. This is the real device.
            const bag = cap.Plugins || {};
            if (bag.Filesystem && bag.Share) {
                pluginCache = { Filesystem: bag.Filesystem, Share: bag.Share, via: 'Plugins' };
                return pluginCache;
            }

            // 2. Bundler/web runtime, if one is ever added.
            if (typeof cap.registerPlugin === 'function') {
                const fsp = cap.registerPlugin('Filesystem');
                const shp = cap.registerPlugin('Share');
                if (fsp && shp) {
                    pluginCache = { Filesystem: fsp, Share: shp, via: 'registerPlugin' };
                    return pluginCache;
                }
            }

            report('neither Capacitor.Plugins nor registerPlugin yielded Filesystem + Share',
                new Error('Plugins keys: ' + Object.keys(bag).join(',')
                    + ' | registerPlugin: ' + typeof cap.registerPlugin));
        } catch (e) {
            report('plugin resolution failed', e);
            pluginCache = null;
        }
        return pluginCache;
    }

    // Technical detail to the console for diagnosis; the golfer gets plain words.
    function report(what, err) {
        try {
            console.error('[RattleExport] ' + what, err);
        } catch (e) { /* console must never break the export */ }
    }

    // ---- READING WHAT IS ON SCREEN ------------------------------------------
    //
    // innerText rather than textContent: innerText respects display:none, so a
    // collapsed section or a print-hidden button does not silently end up in the
    // exported file. Buttons and nav are dropped explicitly for the same reason -
    // "Print / Save PDF" should not appear IN the PDF.
    function linesFrom(roots) {
        const out = [];
        (roots || []).forEach(function (root) {
            if (!root) return;
            const clone = root.cloneNode(true);
            clone.querySelectorAll('button, .nav-link, .btn-primary, .btn-outline, script, style')
                .forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
            const text = (clone.innerText !== undefined && clone.innerText !== null)
                ? clone.innerText
                : (clone.textContent || '');
            String(text).split('\n').forEach(function (raw) {
                const line = raw.replace(/\s+$/, '');
                // Collapse runs of blank lines; a receipt has a lot of whitespace.
                if (line.trim() === '' && out.length && out[out.length - 1] === '') return;
                out.push(line);
            });
        });
        while (out.length && out[out.length - 1] === '') out.pop();
        return out;
    }

    // ---- PDF ----------------------------------------------------------------
    //
    // Helvetica is a PDF base-14 font: no embedding, and WinAnsi covers Latin-1.
    // Anything outside that - emoji, box-drawing - would produce a file a viewer
    // may reject, so it is transliterated or dropped rather than written blind.
    function pdfSafe(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u2192/g, '->')
            .replace(/\u00B7/g, '-')
            .replace(/\u2713/g, 'OK')
            .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    }

    // ( ) and \ are PDF string delimiters and must be escaped or the file is
    // structurally invalid - a golfer's course name with a bracket would break it.
    function pdfEscape(s) {
        return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }

    const PAGE_W = 612;      // US Letter, points
    const PAGE_H = 792;
    const MARGIN = 44;
    const LEAD = 13;         // line height
    const SIZE = 9.5;
    const LINES_PER_PAGE = Math.floor((PAGE_H - MARGIN * 2) / LEAD);
    const MAX_CHARS = 92;    // conservative wrap for Helvetica at this size

    function wrap(line) {
        const clean = pdfSafe(line);
        if (clean.length <= MAX_CHARS) return [clean];
        const words = clean.split(' ');
        const rows = [];
        let cur = '';
        words.forEach(function (w) {
            if (!cur.length) { cur = w; return; }
            if ((cur + ' ' + w).length <= MAX_CHARS) { cur += ' ' + w; return; }
            rows.push(cur);
            cur = w;
        });
        if (cur.length) rows.push(cur);
        return rows.length ? rows : [''];
    }

    function buildPdf(title, lines) {
        const flat = [];
        flat.push(pdfSafe(title));
        flat.push('');
        (lines || []).forEach(function (l) { wrap(l).forEach(function (r) { flat.push(r); }); });

        const pages = [];
        for (let i = 0; i < flat.length; i += LINES_PER_PAGE) {
            pages.push(flat.slice(i, i + LINES_PER_PAGE));
        }
        if (!pages.length) pages.push(['']);

        // object 1 catalog, 2 pages, 3 font, then per page: page obj + content obj
        const objects = [];
        const pageIds = [];
        pages.forEach(function (_, i) { pageIds.push(4 + i * 2); });

        objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objects[2] = '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ')
            + '] /Count ' + pages.length + ' >>';
        objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

        pages.forEach(function (rows, i) {
            const pageId = 4 + i * 2;
            const contentId = pageId + 1;
            objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + ']'
                + ' /Resources << /Font << /F1 3 0 R >> >> /Contents ' + contentId + ' 0 R >>';
            let stream = 'BT /F1 ' + SIZE + ' Tf ' + LEAD + ' TL 1 0 0 1 '
                + MARGIN + ' ' + (PAGE_H - MARGIN) + ' Tm\n';
            rows.forEach(function (r) { stream += '(' + pdfEscape(r) + ') Tj T*\n'; });
            stream += 'ET';
            objects[contentId] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
        });

        let pdf = '%PDF-1.4\n';
        const offsets = [];
        for (let id = 1; id < objects.length; id++) {
            if (objects[id] === undefined) continue;
            offsets[id] = pdf.length;
            pdf += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
        }
        const xrefAt = pdf.length;
        const count = objects.length;
        pdf += 'xref\n0 ' + count + '\n0000000000 65535 f \n';
        for (let id = 1; id < count; id++) {
            const off = offsets[id] === undefined ? 0 : offsets[id];
            pdf += String(off).padStart(10, '0') + ' 00000 n \n';
        }
        pdf += 'trailer\n<< /Size ' + count + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF';
        return pdf;
    }

    function toBase64(str) {
        // Latin-1 only by construction (pdfSafe), so charCodeAt is safe here.
        let bin = '';
        for (let i = 0; i < str.length; i++) bin += String.fromCharCode(str.charCodeAt(i) & 0xff);
        return btoa(bin);
    }

    function safeName(s) {
        return String(s || 'Rattle-Golf')
            .replace(/[^A-Za-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'Rattle-Golf';
    }

    // ---- THE ONE ENTRY POINT ------------------------------------------------
    //
    // Browser: window.print(), exactly as before.
    // Native:  build the PDF from what is on screen, write it to the CACHE
    //          directory - which needs no Info.plist usage description, unlike
    //          Documents with file sharing - and hand the URI to the share sheet.
    //
    // Every native failure is surfaced. A dead button that reports nothing is the
    // bug being fixed here; falling back to window.print() on iOS would recreate
    // it exactly, so the catch path tells the golfer instead.
    function exportOrPrint(opts) {
        const options = opts || {};
        const title = options.title || 'Rattle Golf';
        const roots = options.roots || [document.body];
        const onBefore = typeof options.onBefore === 'function' ? options.onBefore : null;
        const onAfter = typeof options.onAfter === 'function' ? options.onAfter : null;
        const notify = typeof options.notify === 'function'
            ? options.notify
            : function (m) { window.alert(m); };

        if (onBefore) onBefore();

        // ---- THREE STATES, AND "BROWSER" IS NEVER THE FALLBACK --------------
        //
        // A. no Capacitor bridge          -> genuine browser/PWA, window.print()
        // B. bridge present and native    -> PDF + iOS share sheet
        // C. bridge present, not native   -> the Build 4 failure. Detection or
        //                                    plumbing is inconsistent. Printing here
        //                                    is a silent no-op that looks like a dead
        //                                    button, so say so instead.
        const native = isNative();
        const bridge = bridgePresent();

        if (!native && !bridge) {
            const previous = document.title;
            document.title = safeName(title);
            let done = false;
            function finish() {
                if (done) return;
                done = true;
                document.title = previous;
                if (onAfter) onAfter();
            }
            // afterprint where the browser has it: the Trip itinerary keeps a
            // print-only class on <body> that must survive until the dialog closes,
            // and a timer would strip it mid-preview. The timer is the fallback for
            // browsers that never fire the event.
            if ('onafterprint' in window) {
                window.addEventListener('afterprint', finish, { once: true });
            } else {
                setTimeout(finish, 1000);
            }
            window.print();
            return Promise.resolve({ path: 'browser' });
        }

        function fail(code, message, err) {
            report(code, err);
            if (onAfter) onAfter();
            notify(message);
            return Promise.resolve({ path: code, error: err });
        }

        if (!native && bridge) {
            return fail('native-detection-inconsistent',
                'Saving is not set up correctly in this build. Please report this to Manny.',
                new Error('Capacitor bridge present but GolfNet.isNative() is false - is pwa-boot.js loaded on this page?'));
        }

        const plugins = nativePlugins();
        if (!plugins || !plugins.Filesystem || !plugins.Share) {
            return fail('native-unavailable',
                'Saving is unavailable in this build. Please update the app and try again.',
                new Error('Filesystem/Share could not be registered through Capacitor.registerPlugin'));
        }

        const fileName = safeName(title) + '.pdf';

        // Everything from here is wrapped, including the synchronous work: a throw
        // out of the PDF writer used to escape the promise chain entirely and left
        // the golfer with nothing on screen.
        let data;
        try {
            data = toBase64(buildPdf(title, linesFrom(roots)));
        } catch (e) {
            return fail('native-build-failed',
                'Could not build the PDF for this round. Nothing was saved.', e);
        }

        try {
            return Promise.resolve(
                plugins.Filesystem.writeFile({ path: fileName, data: data, directory: 'CACHE' })
            ).then(function () {
                return plugins.Filesystem.getUri({ path: fileName, directory: 'CACHE' });
            }).then(function (res) {
                const uri = res && res.uri;
                if (!uri) throw new Error('Filesystem.getUri returned no uri');
                return plugins.Share.share({ title: safeName(title), files: [uri] });
            }).then(function () {
                if (onAfter) onAfter();
                return { path: 'native-shared', fileName: fileName };
            }).catch(function (err) {
                // Dismissing the share sheet rejects too. That is a choice, not a
                // failure, and must not raise an alarm.
                const msg = String((err && (err.message || err)) || '');
                if (/cancel/i.test(msg)) {
                    if (onAfter) onAfter();
                    return { path: 'native-cancelled' };
                }
                return fail('native-failed',
                    'Could not save or share this round. Please try again.', err);
            });
        } catch (e) {
            return fail('native-failed',
                'Could not save or share this round. Please try again.', e);
        }
    }

    window.RattleExport = {
        isNative: isNative,
        _plugins: nativePlugins,
        bridgePresent: bridgePresent,
        exportOrPrint: exportOrPrint,
        _buildPdf: buildPdf,
        _linesFrom: linesFrom,
        _pdfSafe: pdfSafe,
        _safeName: safeName
    };
})();
