// ============================================================================
// HARDPAN GPS - GOLFAPI.IO: WHAT THE APP NEEDS, AND NOTHING ELSE
//
// ONE copy, used by the Cloud Functions (gps-live-core.js) and the Mac puller
// (tools/golfapi-pull.js), so a course pulled either way has the shape the app
// reads as window.HardPanGolfApi.courses[id].
//
// poi: 1 green, 2 green bunker, 3 fairway bunker, 4 water, 9 dogleg, 11 front tee,
// 12 back tee (5 trees, 6/7/8 yardage markers, 10 road: not shipped).
// location (greens): 1 front, 2 center, 3 back. sideFW: 1 left, 2 center, 3 right.
// ============================================================================
'use strict';
const r6 = (x) => Math.round(Number(x) * 1e6) / 1e6;
const pt = (c) => [r6(c.latitude), r6(c.longitude)];
function stripCourse(course, coords) {
    const n = Number(course.numHoles) || 18;
    const holes = {};
    ((coords && coords.coordinates) || []).forEach((c) => {
        const h = Number(c.hole);
        if (!(h >= 1 && h <= n) || !isFinite(Number(c.latitude)) || !isFinite(Number(c.longitude))) return;
        const o = holes[h] = holes[h] || {};
        const poi = Number(c.poi), loc = Number(c.location), side = ({ 1: 'L', 2: 'C', 3: 'R' })[Number(c.sideFW)] || '';
        if (poi === 1) { o.g = o.g || {}; o.g[({ 1: 'f', 2: 'c', 3: 'b' })[loc] || 'c'] = pt(c); }
        else if (poi === 2 || poi === 3 || poi === 4) (o.z = o.z || []).push([({ 2: 'gb', 3: 'fb', 4: 'w' })[poi], side, r6(c.latitude), r6(c.longitude)]);
        else if (poi === 9) o.d = pt(c);
        else if (poi === 11) { o.t = o.t || {}; o.t.f = pt(c); }
        else if (poi === 12) { o.t = o.t || {}; o.t.b = pt(c); }
    });
    const tees = (course.tees || []).map((t) => {
        const yards = [];
        for (let i = 1; i <= n; i++) yards.push(Number(t['length' + i]) || 0);
        return { name: t.teeName || '', color: t.teeColor || '', yards };
    });
    return {
        id: String(course.courseID || course.id || ''), club: course.clubName || '', course: course.courseName || '',
        city: course.city || '', state: course.state || '', lat: r6(course.latitude), lng: r6(course.longitude),
        holes: n, pars: (course.parsMen || []).slice(0, n).map(Number), hcp: (course.indexesMen || []).slice(0, n).map(Number),
        parsW: (course.parsWomen || []).slice(0, n).map(Number), hcpW: (course.indexesWomen || []).slice(0, n).map(Number),
        measure: course.measure || 'y', tees, updated: course.timestampUpdated || null,
        fetched: (coords && coords.__fetched) || null, h: holes,
    };
}
// GolfAPI sends apiRequestsLeft as a STRING ("22.8") - read as a number, or the
// log would hold null and the floor would never trigger (Grok, 2026-10-10).
function leftOf(v) { const n = Number(v); return v != null && v !== '' && isFinite(n) ? n : null; }
module.exports = { stripCourse, leftOf, r6, pt };
