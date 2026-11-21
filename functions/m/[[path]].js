// ============================================================================
// /m/<CODE> - A ROUND'S SHORT INVITE LINK (2.1.1 Invite, Advisor 2026-11-21;
// iOS hand-off IOS-20261121-0326-211-invite-website.md item 2)
//
// In a browser (no app, or a store app that does not claim /m/ yet) the link
// lands on the round's live scorecard: 302 to /shared?game=<CODE>.
//
// THE CODE FORMAT is the app's own, so the browser and the app accept exactly
// the same links: hp-email-link-open.js gameTarget (feat-211-invite dc80f142)
// takes /^\/m\/([A-Za-z0-9]{4,10})\/?$/ and upper-cases it. Same here. Round
// codes are issued as 6 characters from code-issuer.js's alphabet; the wider
// 4-10 matches the app so a link the app opens never 404s in Safari.
//
// ANYTHING ELSE under /m/ (no code, a bad character, too short or long, more
// path segments) goes to the homepage, 302: a mistyped share link lands
// somewhere useful rather than on "No active room code provided".
//
// 302, never 301: a share link's target may change later. The query of the
// incoming link is dropped - only the code is carried. Never cached.
//
// On tournaments.rattlegolf.com, functions/_middleware.js 301s /m/... to the
// same path on hardpangolf.com before this runs (it is the same one hop).
// _routes.json sends /m/* to Functions; m_invite_link_test.js pins both.
// ============================================================================

export const CODE_RE = /^[A-Za-z0-9]{4,10}$/;

export function inviteTarget(requestUrl) {
    let u;
    try { u = new URL(requestUrl); } catch (e) { return null; }
    const m = /^\/m\/([^/]*)\/?$/.exec(u.pathname);
    const code = m ? m[1] : '';
    if (!CODE_RE.test(code)) return new URL('/', u).toString();
    return new URL('/shared?game=' + code.toUpperCase(), u).toString();
}

export async function onRequest(context) {
    const dest = inviteTarget(context.request.url) || '/';
    return new Response(null, { status: 302, headers: { Location: dest, 'Cache-Control': 'no-store' } });
}
