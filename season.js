// ============================================================================
// SEASON LEDGER — running money, skins and KP across the rounds one crew plays.
//
// One builder for the season page. The Game Day lobby only lists seasons this
// phone has opened and sends the organizer here. Nothing in this file is a
// second settlement engine: a round's money is computeCombinedNetTotals (what
// that round's own Results page shows), its skins and KP are the pool engine's
// own lines, and its net score is computePlayerRoundTotals. A round Results
// would not call settled is listed and left out of every total.
//
// STORAGE. seasons/<code> = { name, notes?, ownerUid, createdAt, updatedAt,
// rounds: { <eventCode>: { addedAt, label } } }. The season stores no money.
// Each linked round stays an ordinary events/<code> record. ownerUid is the
// same Firebase uid that owns a round.
//
// WHO IS WHO. A player id is stable on a round and on a round copied from it
// (the id is issued once and the copy keeps it). The same id with two different
// names is not one golfer — those rounds are counted by normalised name and
// said so. Two different ids with one name are not combined either. A
// placeholder ("Player 1") matches nobody. A name with no id joins the one
// golfer who already holds that name on a stable id, and is left unmatched
// when two such golfers exist.
// ============================================================================

function seasonEscape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function seasonNorm(name) {
    if (typeof normalisePlayerName === 'function') return normalisePlayerName(name);
    return String(name == null ? '' : name).trim().toLowerCase();
}

function seasonIsPlaceholder(name) {
    if (typeof isPlaceholderPlayerName === 'function') return isPlaceholderPlayerName(name);
    return /^player\s*\d+$/.test(seasonNorm(name));
}

function seasonNumericId(id) {
    const s = String(id == null ? '' : id);
    return /^[0-9]+$/.test(s) ? s : null;
}

function seasonRoundCode(text) {
    const raw = String(text || '').trim();
    const fromUrl = /[?&]game=([A-Za-z0-9]+)/.exec(raw);
    const code = String(fromUrl ? fromUrl[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 2 || code.length > 12) return null;
    return code;
}

function seasonCreateRecord(name, notes, ownerUid, now) {
    const n = String(name || '').trim();
    const note = String(notes || '').trim();
    const uid = String(ownerUid || '');
    const t = Number(now);
    if (!n || n.length > 80) return null;
    if (note.length > 280) return null;
    if (!uid) return null;
    if (!isFinite(t) || t <= 0) return null;
    const rec = { name: n, ownerUid: uid, createdAt: t, updatedAt: t };
    if (note) rec.notes = note;
    return rec;
}

// The patch admin.html writes after Save, and the patch the season page writes
// when an existing round is attached. update() touches only these keys, so a
// re-attach does not move addedAt and does not rewrite the season's name.
function seasonAttachPatch(roundCode, label, now, existingAddedAt) {
    const code = seasonRoundCode(roundCode);
    const t = Number(now);
    if (!code || !isFinite(t) || t <= 0) return null;
    const lab = String(label || code).trim().slice(0, 80) || code;
    const patch = { updatedAt: t };
    patch['rounds/' + code + '/label'] = lab;
    if (!(Number(existingAddedAt) > 0)) patch['rounds/' + code + '/addedAt'] = t;
    return patch;
}

function seasonWriteError(err) {
    const m = String((err && err.message) || err || '');
    if (/PERMISSION_DENIED|permission[ _-]denied/i.test(m)) {
        return "Couldn't save the season. The database refused the change. Nothing was saved.";
    }
    return "Couldn't save the season. Check your signal. Nothing was saved.";
}

function seasonAttachError(err, roundSaved) {
    const m = String((err && err.message) || err || '');
    const refused = /PERMISSION_DENIED|permission[ _-]denied/i.test(m);
    if (roundSaved) {
        return refused
            ? 'The round was saved. It could not be added to the season — the database refused that change.'
            : 'The round was saved. It could not be added to the season — check your signal.';
    }
    return refused
        ? "Couldn't add that round. The database refused the change. The round itself was not changed."
        : "Couldn't add that round. Check your signal. The round itself was not changed.";
}

function readSeasonList(storage) {
    try {
        const raw = storage && typeof storage.getItem === 'function' ? storage.getItem('hardpanSeasonList') : null;
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) return [];
        return list.filter(function (x) {
            return x && seasonRoundCode(x.code) && String(x.name || '').trim();
        }).map(function (x) {
            return { code: seasonRoundCode(x.code), name: String(x.name).trim() };
        });
    } catch (e) {
        return [];
    }
}

function rememberSeason(storage, entry) {
    if (!storage || typeof storage.setItem !== 'function') return readSeasonList(storage);
    const code = seasonRoundCode(entry && entry.code);
    const name = String(entry && entry.name || '').trim();
    if (!code || !name) return readSeasonList(storage);
    const list = readSeasonList(storage).filter(function (x) { return x.code !== code; });
    list.unshift({ code: code, name: name });
    const kept = list.slice(0, 20);
    storage.setItem('hardpanSeasonList', JSON.stringify(kept));
    return kept;
}

function seasonListHtml(list) {
    const rows = list || [];
    if (!rows.length) return '<p class="season-list-empty">No season on this phone yet.</p>';
    return rows.map(function (s) {
        const code = seasonRoundCode(s.code) || '';
        return '<a class="season-list-link" href="season.html?season=' + code + '">'
            + seasonEscape(s.name) + '</a>';
    }).join('');
}

function seasonWhen(ms) {
    const n = Number(ms);
    if (!isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

// What one round contributes. Null money / skins / KP / net means "not a final
// figure" — the ledger must not turn that into zero.
function seasonRoundFacts(data) {
    const empty = {
        players: [], final: false, started: false, finished: false,
        moneyByNorm: null, skinsById: null, kpById: null, netById: null
    };
    if (!data || typeof data !== 'object' || Array.isArray(data)) return empty;
    const course = data.courseData || [];
    const scores = data.scores || {};
    const players = (data.players || []).filter(function (p) { return p && (p.name || p.id != null); })
        .map(function (p) { return { id: p.id, name: p.name }; });
    let settlement = { settled: false, finished: false, started: false };
    if (typeof computeRoundSettlement === 'function') {
        try { settlement = computeRoundSettlement(data, course, scores) || settlement; }
        catch (e) { settlement = { settled: false, finished: false, started: false }; }
    }
    const final = settlement.settled === true;
    const facts = {
        players: players,
        final: final,
        started: !!settlement.started,
        finished: !!settlement.finished,
        moneyByNorm: null,
        skinsById: null,
        kpById: null,
        netById: null
    };
    if (!final) return facts;
    if (typeof computeCombinedNetTotals === 'function') {
        try {
            const combined = computeCombinedNetTotals(data, course, scores);
            const money = {};
            Object.keys((combined && combined.netByName) || {}).forEach(function (k) {
                const row = combined.netByName[k];
                if (!row) return;
                money[seasonNorm(row.name)] = row.net || 0;
            });
            facts.moneyByNorm = money;
        } catch (e) { facts.moneyByNorm = null; }
    }
    if (typeof computeMoneyPool === 'function') {
        try {
            const pool = computeMoneyPool(data, course, scores);
            if (pool && pool.valid && pool.skins) {
                const skins = {};
                (pool.skins.lines || []).forEach(function (l) {
                    if (!l || !l.winnerId) return;
                    const u = Number(l.units);
                    skins[String(l.winnerId)] = (skins[String(l.winnerId)] || 0) + (isFinite(u) && u > 0 ? u : 1);
                });
                facts.skinsById = skins;
            }
            if (pool && pool.valid && pool.kp) {
                const kp = {};
                (pool.kp.lines || []).forEach(function (l) {
                    if (!l || !l.winnerId) return;
                    kp[String(l.winnerId)] = (kp[String(l.winnerId)] || 0) + 1;
                });
                facts.kpById = kp;
            }
        } catch (e) { /* a pool that cannot be read contributes no skins or KP */ }
    }
    if (typeof computePlayerRoundTotals === 'function') {
        const nets = {};
        (data.players || []).forEach(function (p) {
            if (!p) return;
            try {
                const t = computePlayerRoundTotals(p, course, scores);
                nets[String(p.id)] = (t && t.complete) ? t.net : null;
            } catch (e) { nets[String(p.id)] = null; }
        });
        facts.netById = nets;
    }
    return facts;
}

function seasonMoneyText(n) {
    if (n == null || !isFinite(Number(n))) return '\u2014';
    const v = Number(n);
    const whole = Math.abs(v - Math.round(v)) < 0.005;
    const abs = Math.abs(v);
    const show = whole ? String(Math.round(abs)) : abs.toFixed(2);
    if (v > 0.005) return '+$' + (whole ? String(Math.round(v)) : v.toFixed(2));
    if (v < -0.005) return '-$' + show;
    return '$0';
}

function seasonCountText(n) {
    if (n == null || !isFinite(Number(n))) return '\u2014';
    return String(n);
}

function seasonNetText(n) {
    if (n == null || !isFinite(Number(n))) return '\u2014';
    const v = Number(n);
    if (Math.abs(v) < 0.05) return 'E';
    const whole = Math.abs(v - Math.round(v)) < 0.05;
    const show = whole ? String(Math.round(Math.abs(v))) : Math.abs(v).toFixed(1);
    return (v > 0 ? '+' : '-') + show;
}

function buildSeasonLedger(rounds, meta) {
    const list = (rounds || []).slice().sort(function (a, b) {
        return (Number(a.addedAt) || 0) - (Number(b.addedAt) || 0) || String(a.code).localeCompare(String(b.code));
    });
    const apps = [];
    list.forEach(function (r) {
        const facts = r.facts || {};
        (facts.players || []).forEach(function (p) {
            const name = String((p && p.name) || '').trim();
            apps.push({
                round: r,
                id: seasonNumericId(p && p.id),
                name: name,
                norm: seasonNorm(name),
                placeholder: !name || seasonIsPlaceholder(name)
            });
        });
    });

    const byId = {};
    apps.forEach(function (a) {
        if (!a.id || a.placeholder) return;
        if (!byId[a.id]) byId[a.id] = [];
        byId[a.id].push(a);
    });
    const stableIds = {};
    const notes = [];
    Object.keys(byId).forEach(function (id) {
        const names = {};
        byId[id].forEach(function (a) {
            if (!names[a.norm]) names[a.norm] = { name: a.name, rounds: [] };
            names[a.norm].rounds.push(a.round.code);
        });
        const keys = Object.keys(names);
        if (keys.length === 1) { stableIds[id] = keys[0]; return; }
        const bits = keys.map(function (k) {
            return names[k].name + ' on ' + names[k].rounds.join(', ');
        });
        notes.push('Player id ' + id + ' is ' + bits.join(' and ') + ' — counted by name, not combined.');
    });

    const stableByNorm = {};
    Object.keys(stableIds).forEach(function (id) {
        const norm = stableIds[id];
        if (!stableByNorm[norm]) stableByNorm[norm] = [];
        stableByNorm[norm].push(id);
    });

    function assign(a) {
        if (a.placeholder) {
            return { key: 'unmatched:' + a.round.code + ':' + (a.id || 'noname'), unmatched: 'no-name' };
        }
        if (a.id && stableIds[a.id]) return { key: 'id:' + a.id, unmatched: null };
        const ids = stableByNorm[a.norm] || [];
        if (!a.id && ids.length === 1) return { key: 'id:' + ids[0], unmatched: null };
        if (!a.id && ids.length > 1) return { key: 'unmatched:' + a.round.code + ':' + a.norm, unmatched: 'ambiguous' };
        if (a.norm) return { key: 'name:' + a.norm, unmatched: null };
        return { key: 'unmatched:' + a.round.code + ':blank', unmatched: 'no-name' };
    }

    const golfers = {};
    const unmatched = [];
    function golfer(key, name) {
        if (!golfers[key]) {
            golfers[key] = {
                key: key, name: name || 'Golfer', norm: seasonNorm(name),
                money: null, skins: null, kp: null, net: null, netRounds: 0,
                finalRounds: 0, openRounds: 0
            };
        }
        if (name && name.length > golfers[key].name.length) golfers[key].name = name;
        return golfers[key];
    }

    apps.forEach(function (a) {
        const asg = assign(a);
        if (asg.unmatched) {
            unmatched.push({
                name: a.name || 'No name',
                roundCode: a.round.code,
                reason: asg.unmatched
            });
            return;
        }
        const g = golfer(asg.key, a.name);
        const facts = a.round.facts || {};
        if (!facts.final) { g.openRounds += 1; return; }
        g.finalRounds += 1;
        const counts = {};
        (facts.players || []).forEach(function (p) {
            const n = seasonNorm(p && p.name);
            if (!n || seasonIsPlaceholder(p && p.name)) return;
            counts[n] = (counts[n] || 0) + 1;
        });
        if (facts.moneyByNorm && counts[a.norm] > 1) {
            notes.push(a.round.code + ' has more than one ' + (a.name || 'golfer') + ' — that round\u2019s money is not in the total.');
        } else if (facts.moneyByNorm) {
            const net = facts.moneyByNorm[a.norm];
            g.money = (g.money == null ? 0 : g.money) + (net || 0);
        }
        if (facts.skinsById && a.id) {
            g.skins = (g.skins == null ? 0 : g.skins) + (facts.skinsById[a.id] || 0);
        }
        if (facts.kpById && a.id) {
            g.kp = (g.kp == null ? 0 : g.kp) + (facts.kpById[a.id] || 0);
        }
        if (facts.netById && a.id && facts.netById[a.id] != null) {
            g.net = (g.net == null ? 0 : g.net) + facts.netById[a.id];
            g.netRounds += 1;
        }
    });

    const seenSame = {};
    Object.keys(golfers).forEach(function (k) {
        if (k.indexOf('id:') !== 0) return;
        const g = golfers[k];
        const twins = Object.keys(golfers).filter(function (other) {
            return other.indexOf('id:') === 0 && other !== k && golfers[other].norm && golfers[other].norm === g.norm;
        });
        twins.forEach(function (other) {
            const sig = [k, other].sort().join('|');
            if (seenSame[sig]) return;
            seenSame[sig] = true;
            notes.push(g.name + ' is on two different player ids — not combined.');
        });
    });

    const roundRows = list.map(function (r) {
        const facts = r.facts || {};
        let state = 'missing';
        if (facts.final) state = 'final';
        else if (facts.started) state = 'open';
        else state = 'empty';
        return {
            code: r.code,
            label: r.label || r.code,
            state: state
        };
    });

    const people = Object.keys(golfers).map(function (k) { return golfers[k]; });
    people.sort(function (a, b) {
        const am = a.money == null ? -Infinity : a.money;
        const bm = b.money == null ? -Infinity : b.money;
        if (bm !== am) return bm - am;
        return String(a.name).localeCompare(String(b.name));
    });

    const finalCount = roundRows.filter(function (r) { return r.state === 'final'; }).length;
    const openCount = roundRows.length - finalCount;
    return {
        updatedAt: meta && meta.updatedAt,
        notes: notes.filter(function (n, i) { return notes.indexOf(n) === i; }),
        rounds: roundRows,
        golfers: people,
        unmatched: unmatched,
        finalCount: finalCount,
        openCount: openCount
    };
}

function seasonRoundStateWord(state) {
    if (state === 'final') return 'Final — in the total';
    if (state === 'open') return 'Not final — not in the total';
    if (state === 'empty') return 'Not started — not in the total';
    return 'Round not found — not in the total';
}

function seasonLedgerHtml(ledger) {
    const L = ledger || { rounds: [], golfers: [], unmatched: [], notes: [] };
    const when = seasonWhen(L.updatedAt);
    let html = '<div class="season-ledger-card">';
    html += '<div class="season-updated">'
        + (when ? ('Updated ' + seasonEscape(when) + '. ') : '')
        + seasonEscape(String(L.finalCount || 0)) + ' '
        + ((L.finalCount === 1) ? 'round' : 'rounds') + ' in the total'
        + (L.openCount ? (', ' + L.openCount + ' not final') : '')
        + '.</div>';
    if (!L.rounds.length) {
        html += '<p class="season-empty">No rounds in this season yet. Add one, or start the next round from a round already here.</p>';
        html += '</div>';
        return html;
    }
    html += '<div class="season-rounds">';
    L.rounds.forEach(function (r) {
        html += '<div class="season-round" data-code="' + seasonEscape(r.code) + '" data-final="'
            + (r.state === 'final' ? 'yes' : 'no') + '">'
            + '<span class="season-round-label">' + seasonEscape(r.label) + '</span>'
            + '<span class="season-round-code">' + seasonEscape(r.code) + '</span>'
            + '<span class="season-round-state">' + seasonEscape(seasonRoundStateWord(r.state)) + '</span>'
            + '</div>';
    });
    html += '</div>';
    (L.notes || []).forEach(function (n) {
        html += '<p class="season-note">' + seasonEscape(n) + '</p>';
    });
    if (!L.golfers.length && !(L.unmatched || []).length) {
        html += '<p class="season-empty">No golfers in the linked rounds yet.</p></div>';
        return html;
    }
    html += '<div class="season-head"><span>Golfer</span><span>Money</span><span>Skins</span><span>KP</span><span>Net</span></div>';
    (L.golfers || []).forEach(function (g) {
        const played = (g.finalRounds || 0) + ' final'
            + (g.openRounds ? (' \u00B7 ' + g.openRounds + ' not final') : '');
        html += '<div class="season-golfer" data-key="' + seasonEscape(g.key) + '">'
            + '<span class="season-name">' + seasonEscape(g.name)
            + '<span class="season-played">' + seasonEscape(played) + '</span></span>'
            + '<span class="season-money">' + seasonEscape(seasonMoneyText(g.money)) + '</span>'
            + '<span class="season-skins">' + seasonEscape(seasonCountText(g.skins)) + '</span>'
            + '<span class="season-kp">' + seasonEscape(seasonCountText(g.kp)) + '</span>'
            + '<span class="season-net">' + seasonEscape(seasonNetText(g.net)) + '</span>'
            + '</div>';
    });
    (L.unmatched || []).forEach(function (u) {
        const why = u.reason === 'ambiguous'
            ? 'Same name as two different player ids — not added.'
            : 'No usable name — not added.';
        html += '<div class="season-unmatched">'
            + seasonEscape((u.name || 'No name') + ' on ' + u.roundCode + ' — ' + why)
            + '</div>';
    });
    html += '<p class="season-foot">Money, skins and KP are the finalized Results for each round. A round that is not final is named above and left out, so an empty card is not a loss.</p>';
    html += '</div>';
    return html;
}
