// ============================================================================
// E4 TOURNAMENT PHOTO WALL - THE CALLABLES, WITH EVERYTHING INJECTED (2026-11-09)
//
// In the existing `tournaments-stripe` codebase (not renamed). No Stripe, no
// money: these four only move photos. makePhotoHandlers({ db, bucket, now })
// returns the entry points index.js wires to onCall:
//
//   photoLinks({code}, {uid, email})          owner -> { links: {id: url} } 10-minute
//                                             signed links for pending (and reported
//                                             shown) photos, which no client can read
//   approvePhoto({code, photoId}, {uid,email}) owner -> moves pending/<id>.jpg to
//                                             shown/<id>.jpg and the meta pending -> shown;
//                                             on a shown photo it clears its reports (Keep)
//   hidePhoto({code, photoId}, {uid,email})   owner -> moves pending or shown to hidden/
//                                             (file + meta, hiddenAt), clears reports
//   reportPhoto({code, photoId})              anyone (no sign-in needed) -> counts a report
//                                             on a SHOWN photo; the owner sees it in the queue
//
// The OWNER is tournaments/<code>/ownerUid, or a co-organizer by email
// (tournaments/<code>/coOrganizers/<email with every '.' as ','>), the same two
// the database rules let manage an event.
//
// Paths: Storage tournamentPhotos/<code>/{pending,shown,hidden}/<id>.jpg;
// database tournamentPhotoMeta/<code>/{pending,shown,hidden,reports}/<id>.
// A pending file is moved only when its meta exists: the meta is the database's
// proof that a key holder posted it (Storage rules cannot read the database).
//
// HIDDEN PHOTOS: deleted 7 days after the event BY HAND in Phase 1 (README.md,
// "Photo wall: deleting hidden photos"). No scheduled function yet.
// ============================================================================
'use strict';

const REASONS = {
    UNAUTHENTICATED: 'unauthenticated', NOT_OWNER: 'not-owner', NOT_FOUND: 'not-found',
    BAD_REQUEST: 'bad-request', BAD_FILE: 'bad-file'
};
const ERROR_CODES = {
    'unauthenticated': 'unauthenticated', 'not-owner': 'permission-denied', 'not-found': 'not-found',
    'bad-request': 'invalid-argument', 'bad-file': 'failed-precondition'
};
class PhotoError extends Error {
    constructor(reason) { super(reason); this.reason = reason; this.code = ERROR_CODES[reason] || 'internal'; }
}

const CODE_RE = /^[A-Za-z0-9]{3,12}$/;
const ID_RE = /^-?[A-Za-z0-9_-]{1,40}$/;
const MAX_BYTES = 5 * 1024 * 1024;
const LINK_MS = 10 * 60 * 1000;
const REPORT_CAP = 999;

function parse(data) {
    const code = data && typeof data.code === 'string' ? data.code : '';
    const photoId = data && typeof data.photoId === 'string' ? data.photoId : '';
    if (!CODE_RE.test(code)) throw new PhotoError(REASONS.BAD_REQUEST);
    return { code, photoId };
}
const emailKey = (email) => String(email || '').toLowerCase().split('.').join(',');
const filePath = (code, state, id) => 'tournamentPhotos/' + code + '/' + state + '/' + id + '.jpg';
const metaPath = (code, state, id) => 'tournamentPhotoMeta/' + code + '/' + state + (id ? '/' + id : '');

function makePhotoHandlers(deps) {
    const db = deps.db, bucket = deps.bucket;
    const now = deps.now || (() => Date.now());
    const val = async (p) => (await db.ref(p).once('value')).val();

    async function requireOwner(code, ctx) {
        if (!ctx || !ctx.uid) throw new PhotoError(REASONS.UNAUTHENTICATED);
        const t = await val('tournaments/' + code);
        if (!t) throw new PhotoError(REASONS.NOT_FOUND);
        if (t.ownerUid && t.ownerUid === ctx.uid) return t;
        if (ctx.email && t.coOrganizers && t.coOrganizers[emailKey(ctx.email)] === true) return t;
        throw new PhotoError(REASONS.NOT_OWNER);
    }
    function requireId(photoId) { if (!ID_RE.test(photoId)) throw new PhotoError(REASONS.BAD_REQUEST); }

    // Copy then delete (Storage has no rename). The source must be a JPEG within the cap.
    // missingOk: Hide still hides the META of a photo whose file never arrived.
    async function moveFile(code, from, to, id, missingOk) {
        const src = bucket.file(filePath(code, from, id));
        const [exists] = await src.exists();
        if (!exists) { if (missingOk) return; throw new PhotoError(REASONS.NOT_FOUND); }
        const [meta] = await src.getMetadata();
        if (meta.contentType !== 'image/jpeg' || !(Number(meta.size) > 0) || Number(meta.size) > MAX_BYTES) throw new PhotoError(REASONS.BAD_FILE);
        await src.copy(bucket.file(filePath(code, to, id)));
        await src.delete();
    }

    async function photoLinks(data, ctx) {
        const { code } = parse(data);
        await requireOwner(code, ctx);
        const pending = (await val(metaPath(code, 'pending'))) || {};
        const reports = (await val(metaPath(code, 'reports'))) || {};
        const ids = Object.keys(pending).filter((id) => ID_RE.test(id)).map((id) => [id, 'pending'])
            .concat(Object.keys(reports).filter((id) => ID_RE.test(id)).map((id) => [id, 'shown']));
        const links = {};
        for (const [id, state] of ids) {
            const f = bucket.file(filePath(code, state, id));
            const [exists] = await f.exists();
            if (!exists) continue;
            const [url] = await f.getSignedUrl({ version: 'v4', action: 'read', expires: now() + LINK_MS });
            links[id] = url;
        }
        return { links };
    }

    async function approvePhoto(data, ctx) {
        const { code, photoId } = parse(data);
        requireId(photoId);
        await requireOwner(code, ctx);
        const meta = await val(metaPath(code, 'pending', photoId));
        if (!meta) {
            // KEEP: a shown photo that was reported stays up; its reports are cleared.
            if (await val(metaPath(code, 'shown', photoId))) {
                await db.ref(metaPath(code, 'reports', photoId)).remove();
                return { state: 'shown' };
            }
            throw new PhotoError(REASONS.NOT_FOUND);
        }
        await moveFile(code, 'pending', 'shown', photoId);
        await db.ref().update({
            [metaPath(code, 'shown', photoId)]: Object.assign({}, meta, { shownAt: now() }),
            [metaPath(code, 'pending', photoId)]: null
        });
        return { state: 'shown' };
    }

    async function hidePhoto(data, ctx) {
        const { code, photoId } = parse(data);
        requireId(photoId);
        await requireOwner(code, ctx);
        let from = 'pending';
        let meta = await val(metaPath(code, 'pending', photoId));
        if (!meta) { from = 'shown'; meta = await val(metaPath(code, 'shown', photoId)); }
        if (!meta) throw new PhotoError(REASONS.NOT_FOUND);
        await moveFile(code, from, 'hidden', photoId, true);
        await db.ref().update({
            [metaPath(code, 'hidden', photoId)]: Object.assign({}, meta, { hiddenAt: now(), from: from }),
            [metaPath(code, from, photoId)]: null,
            [metaPath(code, 'reports', photoId)]: null
        });
        return { state: 'hidden' };
    }

    async function reportPhoto(data) {
        const { code, photoId } = parse(data);
        requireId(photoId);
        if (!(await val(metaPath(code, 'shown', photoId)))) throw new PhotoError(REASONS.NOT_FOUND);
        const at = now();
        await db.ref(metaPath(code, 'reports', photoId)).transaction((cur) => ({
            count: Math.min(REPORT_CAP, ((cur && Number(cur.count)) || 0) + 1), lastAt: at
        }));
        return { reported: true };
    }

    return { photoLinks, approvePhoto, hidePhoto, reportPhoto };
}

module.exports = { makePhotoHandlers, PhotoError, REASONS, ERROR_CODES, MAX_BYTES, LINK_MS, filePath, metaPath, emailKey };
