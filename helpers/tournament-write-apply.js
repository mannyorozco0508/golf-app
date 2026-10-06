// ============================================================================
// APPLY A PAGE'S CAPTURED WRITES TO A RECORD, the way the server would.
//
// The mini-dom db stub records every set/update/remove as { path, op, value }.
// A test that wants to know what a golfer SEES after an organizer action has to
// feed those writes back through the page's own value listener. This does the
// arithmetic of that once: a set replaces the node at its path, an update
// writes each key as a child path (keys may themselves contain slashes, which is
// what a multi-path update is), a remove deletes. Writes outside `prefix` are
// ignored, so a registration echo does not land inside the tournament record.
// ============================================================================

function setAt(root, parts, value) {
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
        if (node[parts[i]] === null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
        node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = JSON.parse(JSON.stringify(value));
}

// A root ref (db.ref() with no path) is recorded with an undefined path.
function splitPath(p) { return (p === undefined || p === null) ? [] : String(p).split('/').filter(Boolean); }

// Applies every captured write whose full path starts with `prefix` to `rec`,
// which is the object stored AT `prefix`. Returns rec.
function applyWrites(rec, writes, prefix) {
    const pre = splitPath(prefix);
    const under = (parts) => pre.every((seg, i) => parts[i] === seg) ? parts.slice(pre.length) : null;
    writes.forEach((w) => {
        const base = splitPath(w.path);
        if (w.op === 'update' && w.value && typeof w.value === 'object') {
            Object.keys(w.value).forEach((k) => {
                const rel = under(base.concat(splitPath(k)));
                if (rel && rel.length) setAt(rec, rel, w.value[k]);
            });
            return;
        }
        const rel = under(base);
        if (!rel || !rel.length) return;
        setAt(rec, rel, w.op === 'remove' ? null : w.value);
    });
    return rec;
}

module.exports = { applyWrites };

// THE ONE MULTI-PATH APPROVE, READ AS THE PATHS IT WRITES (Wave 1, A5).
// Approve used to be a set on the field and then an update on the entry. It is
// one root update() now. Suites written against the two-write shape read the
// same facts through this: every key under tournaments/ becomes a set at its
// own path, and every registrations/<code>/<id>/<key> is gathered into one
// update on the entry - so "the team was created" and "the entry was marked"
// are still asserted as such, and not as an accident of how many calls it took.
function flatWrites(writes) {
    const out = [];
    writes.forEach((w) => {
        const rootUpdate = (w.path === undefined || w.path === null || w.path === '') && w.op === 'update';
        if (!rootUpdate) { out.push(w); return; }
        const marks = {};
        Object.keys(w.value || {}).forEach((k) => {
            const m = /^(registrations\/[^/]+\/[^/]+)\/(.+)$/.exec(k);
            if (m) { (marks[m[1]] = marks[m[1]] || {})[m[2]] = w.value[k]; return; }
            out.push({ path: k, op: 'set', value: w.value[k], multiPath: true });
        });
        Object.keys(marks).forEach((p) => out.push({ path: p, op: 'update', value: marks[p], multiPath: true }));
    });
    return out;
}

module.exports.flatWrites = flatWrites;
