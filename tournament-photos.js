// ============================================================================
// HARDPAN TOURNAMENTS - EVENT PHOTO WALL (E4, approved "as mocked" 2026-11-09)
//
// ONE set of paths and builders for the two pages that touch photos:
// tournament-scorecard.html (a golfer posts, E4a) and tournament.html (the
// organizer's queue, E4b, and the public recap, E4c). Pure: no DOM, no network.
//
// STORAGE (bucket golfapp-9fb21.firebasestorage.app, storage.rules):
//   tournamentPhotos/<code>/pending/<id>.jpg   a phone uploads here (signed in, JPEG <= 5 MB)
//   tournamentPhotos/<code>/shown/<id>.jpg     approvePhoto moves it here; public GET by name
//   tournamentPhotos/<code>/hidden/<id>.jpg    hidePhoto moves it here; deleted by hand 7 days on
// DATABASE:
//   tournamentPhotoMeta/<code>/pending/<id> = { team, caption?, at, w, h }   + photoProofs/<code>/<id>
//   tournamentPhotoMeta/<code>/shown/<id>, /hidden/<id>, /reports/<id>     (the callables write these)
//
// THE PHONE RESIZES TO 1600 PX AND RE-ENCODES before upload (canvas -> JPEG),
// which drops EXIF, so the photo's location never leaves the phone.
// tournament_photo_exif_chrome_test.js uploads a photo carrying GPS EXIF and
// proves the bytes sent carry none.
// ============================================================================
(function (root) {
    'use strict';
    var BUCKET = 'golfapp-9fb21.firebasestorage.app';
    var MAX_PX = 1600;
    var MAX_BYTES = 5 * 1024 * 1024;
    var API = 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o';

    function filePath(code, state, id) { return 'tournamentPhotos/' + code + '/' + state + '/' + id + '.jpg'; }
    function uploadUrl(code, id) { return API + '?uploadType=media&name=' + encodeURIComponent(filePath(code, 'pending', id)); }
    function shownUrl(code, id) { return API + '/' + encodeURIComponent(filePath(code, 'shown', id)) + '?alt=media'; }

    // The longest side to at most 1600 px, never enlarged, whole pixels.
    function fitWithin(w, h, max) {
        var m = max || MAX_PX, W = Number(w) || 0, H = Number(h) || 0;
        if (W <= 0 || H <= 0) return null;
        var s = Math.min(1, m / Math.max(W, H));
        return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) };
    }

    // ONE database update: the pending meta and its key proof (the score-proof
    // shape). caption is left out when empty (the rules take 1..120 characters).
    function metaUpdate(o, timestamp) {
        var meta = { team: o.who, at: timestamp, w: o.w, h: o.h };
        var cap = String(o.caption || '').trim().slice(0, 120);
        if (cap) meta.caption = cap;
        var out = {};
        out['tournamentPhotoMeta/' + o.code + '/pending/' + o.id] = meta;
        out['photoProofs/' + o.code + '/' + o.id] = { who: o.who, k: o.k, t: timestamp };
        return out;
    }

    // "Team 4 · 7th tee": who posted it, then the caption.
    function photoLabel(data, meta) {
        var who = String((meta && meta.team) || '');
        var m = /^team(\d+)$/.exec(who), name = '';
        if (m) { var t = ((data && data.teams) || {})['team' + m[1]]; name = (t && t.name) || ('Team ' + m[1]); }
        else { var p = ((data && data.players) || {})[who]; name = (p && p.name) || ''; }
        return [name, meta && meta.caption].filter(Boolean).join(' · ');
    }
    function ordered(map) {
        return Object.keys(map || {}).map(function (id) { return Object.assign({ id: id }, map[id]); })
            .sort(function (a, b) { return (Number(a.at) || 0) - (Number(b.at) || 0); });
    }

    var api = { BUCKET: BUCKET, MAX_PX: MAX_PX, MAX_BYTES: MAX_BYTES, filePath: filePath, uploadUrl: uploadUrl,
        shownUrl: shownUrl, fitWithin: fitWithin, metaUpdate: metaUpdate, photoLabel: photoLabel, ordered: ordered };
    root.TournamentPhotos = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
