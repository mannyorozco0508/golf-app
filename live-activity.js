// ============================================================================
// live-activity.js — THE LOCK SCREEN CARD, FROM THE PAGE THAT KNOWS THE SCORE
//
// PHASE 1, LOCAL. The scorekeeper's phone - or a golfer who answered "I'm
// playing" - gets a Live Activity on the lock screen and in the Dynamic Island
// showing their score to par, how many holes they are thru, and their top
// match's status. It starts when they open a round and have said who they are,
// updates on every score, and ENDS when the round finishes.
//
// THE PAGE OWNS EVERY WORD. This file computes nothing: it is handed the row
// liveStandings() already built for that golfer and the line
// buildLiveMatchStates() already wrote for their top wager, and it posts them.
// A second answer to "what is Manny's score", written in Swift, is exactly the
// drift this app has paid for before.
//
// NO MONEY ON THE LOCK SCREEN. The match line is a STATUS - "Front 2 UP" - and
// never a running total. That is the Receipt's rule everywhere else in the app
// and a lock screen is the worst place to break it: the figure is wrong the
// moment a press lands, and nobody is looking at the app to see it corrected.
//
// FAILS QUIET, EVERYWHERE. No Capacitor (a browser), no plugin (Android, or an
// iOS build before the extension is added), Live Activities switched off, iOS
// before 16.1 - every one of those is a no-op. A round must never fail to open
// because a widget could not start.
// ============================================================================
(function (root) {
    'use strict';

    function plugin() {
        try {
            var cap = root && root.Capacitor;
            if (!cap || !cap.Plugins) return null;
            return cap.Plugins.HardPanLiveActivity || null;
        } catch (e) { return null; }
    }

    function available() { return !!plugin(); }

    // WHAT THE CARD SHOWS, built from what the page already has.
    //
    //   row       one entry from liveStandings(): { toPar, thru, name }
    //   matchText the top match's status line, or '' - the caller picks which
    //             match is "top" because the caller is the one with the list in
    //             the order it renders them.
    //
    // toPar is formatted by the PAGE (formatToPar), so "E" and "+1" are the same
    // strings a golfer is reading on the card in their hand.
    function buildState(row, matchText, hole) {
        var r = row || {};
        var thru = Number(r.thru);
        return {
            toPar: String(r.toPar === undefined || r.toPar === null ? 'E' : r.toPar),
            thru: isFinite(thru) && thru > 0 ? Math.round(thru) : 0,
            matchLine: String(matchText == null ? '' : matchText).slice(0, 80),
            hole: Math.max(1, Math.round(Number(hole) || 1))
        };
    }

    // Started once per round per device. The plugin ends any previous activity
    // itself, so a golfer who opens a second round does not collect cards.
    var startedFor = null;

    function start(opts) {
        var p = plugin();
        if (!p || !opts || !opts.roundCode) return Promise.resolve(false);
        startedFor = String(opts.roundCode);
        var payload = buildState(opts.row, opts.matchText, opts.hole);
        payload.golferName = String(opts.golferName || 'You');
        payload.courseName = String(opts.courseName || '');
        payload.roundCode = startedFor;
        return Promise.resolve(p.start(payload)).then(function (r) {
            return !!(r && r.started);
        }, function () { return false; });
    }

    function update(opts) {
        var p = plugin();
        if (!p || !startedFor) return Promise.resolve(false);
        return Promise.resolve(p.update(buildState(opts && opts.row, opts && opts.matchText, opts && opts.hole)))
            .then(function (r) { return !!(r && r.updated); }, function () { return false; });
    }

    function end() {
        var p = plugin();
        startedFor = null;
        if (!p) return Promise.resolve(false);
        return Promise.resolve(p.end({})).then(function (r) {
            return !!(r && r.ended);
        }, function () { return false; });
    }

    function startedRound() { return startedFor; }

    var api = { available: available, buildState: buildState, start: start,
                update: update, end: end, startedRound: startedRound };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.liveActivity = api;
})(typeof window !== 'undefined' ? window : null);
