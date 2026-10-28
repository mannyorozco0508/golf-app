// ============================================================================
// 096 - THE BUDDY PREVIEW GATE, SERVER SIDE (Pages Functions middleware).
// PREVIEW DEPLOY ONLY: tools/buddy-preview/stage.sh copies it to functions/_middleware.js
// of the gps-buddy staging folder. Never in the repo's functions/, never in production.
// After Wed Nov 4, 2026 11:59 PM Arizona time (UTC-7, no DST), by the server's own clock,
// every request (pages, scripts, /api) gets the end page and nothing else.
// ============================================================================
export const END = 1793862000000;   // 2026-11-05T07:00:00Z
export const MSG = 'This preview has ended. Thanks for testing HardPan!';
const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>HardPan preview</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
    + 'padding:24px;box-sizing:border-box;background:#f0f4f2;color:#0f4c3a;font:600 20px/1.4 -apple-system,system-ui,sans-serif;text-align:center">'
    + '<p id="buddy-preview-ended">' + MSG + '</p></body></html>';
export async function onRequest(context) {
    if (Date.now() < END) return context.next();
    return new Response(PAGE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
