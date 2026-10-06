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

function splitPath(p) { return String(p).split('/').filter(Boolean); }

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
