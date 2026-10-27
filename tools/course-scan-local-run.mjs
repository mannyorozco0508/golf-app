// 080 ONE-CARD LOCAL TEST: one real course-mode call from this Mac (never the
// live site, never wrangler). Flash first; ONE Pro retry only if a check fails.
// The key is read from a file into memory only. It is never printed or logged,
// never put in a URL (it goes in the x-goog-api-key header), and the output
// below carries only the read, the checks and the token counts.
//   node tools/course-scan-local-run.mjs <photo.jpg> <out.json>
import fs from 'fs';
import os from 'os';
import path from 'path';
import { callGemini, COURSE_SPEC } from '../functions/api/_scan.js';
import C from '../course-card-validate.js';

const [photo, outFile] = process.argv.slice(2);
const FLASH = 'gemini-3.8-flash', PRO = 'gemini-3.1-pro-preview';
let key = '';
try { key = fs.readFileSync(path.join(os.homedir(), '.hardpan', 'gemini.key'), 'utf8').trim(); } catch (e) { console.log('no key file'); process.exit(2); }
const w = { key, doFetch: (...a) => globalThis.fetch(...a) };
key = '';
const image = { mimeType: 'image/jpeg', data: fs.readFileSync(photo).toString('base64') };
const course = { holes: 18, name: '' };
const calls = [];
async function one(model) {
    const t = Date.now();
    let r;
    try { r = await callGemini(w, model, image, course, COURSE_SPEC); } catch (e) { r = { error: 'exception' }; }
    const v = r.error ? null : C.validateCourse(r.parsed, course);
    calls.push({ model, ms: Date.now() - t, error: r.error || null, upstream: r.upstream || null, tokens: r.tokens || null,
        parsed: r.parsed || null, validation: v });
    console.log(model, r.error ? 'error ' + r.error + ' ' + JSON.stringify(r.upstream || {}) : 'tokens ' + JSON.stringify(r.tokens) + ' hard ' + JSON.stringify(v.hard.map((h) => h.code + ':' + (h.row || '') + (h.nine ? '/' + h.nine : ''))) + ' soft ' + v.suspectCount);
    return v;
}
const v1 = await one(FLASH);
if (v1 && C.needsRetry(v1)) await one(PRO);
w.key = null;
fs.writeFileSync(outFile, JSON.stringify(calls, null, 1));
