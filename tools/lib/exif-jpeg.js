// ============================================================================
// A JPEG WITH GPS IN ITS EXIF, AND A SCANNER THAT FINDS IT (E4, 2026-11-09).
//
// withGpsExif(jpeg, lat, lng) inserts an APP1 "Exif" segment right after SOI
// carrying IFD0 -> GPSInfo (tag 0x8825) -> GPSLatitudeRef / GPSLatitude /
// GPSLongitudeRef / GPSLongitude, the way a phone camera writes them.
// scanJpeg(buf) walks the markers up to SOS and reports what is there:
// { jpeg, exif, gps, width, height, markers }, plus a whole-file search for
// the "Exif\0\0" signature and the GPS tag in either byte order.
// The scanner is checked against the fixture (it MUST find both) before any
// claim that an upload carries neither is believed.
// ============================================================================
'use strict';

function rational(buf, at, num, den) { buf.writeUInt32LE(num, at); buf.writeUInt32LE(den, at + 4); }
function dms(deg) {
    const a = Math.abs(deg), d = Math.floor(a), mFloat = (a - d) * 60, m = Math.floor(mFloat), s = Math.round((mFloat - m) * 60 * 1000);
    return [[d, 1], [m, 1], [s, 1000]];
}
function withGpsExif(jpeg, lat, lng) {
    if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) throw new Error('not a JPEG');
    const tiff = Buffer.alloc(128);
    tiff.write('II', 0, 'ascii'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
    // IFD0: one entry, GPSInfo -> 26
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x8825, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
    tiff.writeUInt32LE(0, 22);
    // GPS IFD at 26: four entries, data at 80 (lat) and 104 (lng)
    tiff.writeUInt16LE(4, 26);
    const entry = (i, tag, type, count, value) => { const o = 28 + i * 12; tiff.writeUInt16LE(tag, o); tiff.writeUInt16LE(type, o + 2); tiff.writeUInt32LE(count, o + 4); value(o + 8); };
    entry(0, 0x0001, 2, 2, (o) => tiff.write(lat >= 0 ? 'N\0' : 'S\0', o, 'ascii'));
    entry(1, 0x0002, 5, 3, (o) => tiff.writeUInt32LE(80, o));
    entry(2, 0x0003, 2, 2, (o) => tiff.write(lng >= 0 ? 'E\0' : 'W\0', o, 'ascii'));
    entry(3, 0x0004, 5, 3, (o) => tiff.writeUInt32LE(104, o));
    tiff.writeUInt32LE(0, 76);
    dms(lat).forEach(([n, d], i) => rational(tiff, 80 + i * 8, n, d));
    dms(lng).forEach(([n, d], i) => rational(tiff, 104 + i * 8, n, d));
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
    const head = Buffer.from([0xff, 0xe1, 0, 0]);
    head.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([jpeg.subarray(0, 2), head, payload, jpeg.subarray(2)]);
}

function scanJpeg(buf) {
    const out = { jpeg: buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9,
        exif: false, gps: false, width: null, height: null, markers: [] };
    let i = 2;
    while (i + 4 <= buf.length && buf[i] === 0xff) {
        const marker = buf[i + 1];
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        out.markers.push(marker.toString(16));
        const seg = buf.subarray(i + 4, i + 2 + len);
        if (marker === 0xe1 && seg.subarray(0, 6).toString('binary') === 'Exif\0\0') {
            out.exif = true;
            if (seg.indexOf(Buffer.from([0x25, 0x88])) > -1 || seg.indexOf(Buffer.from([0x88, 0x25])) > -1) out.gps = true;
        }
        if (marker >= 0xc0 && marker <= 0xc3) { out.height = buf.readUInt16BE(i + 5); out.width = buf.readUInt16BE(i + 7); }
        if (marker === 0xda) break;
        i += 2 + len;
    }
    out.exifAnywhere = buf.indexOf(Buffer.from('Exif\0\0', 'binary')) > -1;
    return out;
}

module.exports = { withGpsExif, scanJpeg };
