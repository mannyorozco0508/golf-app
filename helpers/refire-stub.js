// ============================================================================
// THE RE-FIRING STUB, shared by the cold-Chrome score-entry tests.
//
// Wraps tools/lib/cold-arrival.js's firebase stand-in: every value listener on
// events/<CODE> is remembered; set() on a score path writes into a shadow copy
// of the round and invokes that listener SYNCHRONOUSLY, as the vendored SDK
// does. window.__remote(patch) is the stub's own door for "another device's
// snapshot": it merges a scores patch and fires the listener without any local
// write; window.__remoteRoster(order) does the same for a roster reorder.
// Event tracing (capture phase, score boxes only) records the order in
// window.__ev. TRACE_ONLY is the same tracing over the harness's no-op set().
//
// The page must have set window.__STUBDB to the same database the arrival was
// given (the preScript does: 'window.__STUBDB = ' + JSON.stringify(DB) + ';').
// ============================================================================
const REFIRE = `
(function () {
  window.__ev = []; window.__refired = 0;
  var tag = function (t) { var n = t && t.closest && t.closest('.hv-player-row'); return n ? n.querySelector('.hv-player-name').innerText.split('\\n')[0].split(' ')[0] : '?'; };
  ['input', 'change', 'blur', 'focus'].forEach(function (k) {
    document.addEventListener(k, function (e) { if (e.target && e.target.classList && e.target.classList.contains('score-input')) window.__ev.push(k + '(' + tag(e.target) + ')'); }, true);
  });
  var listeners = []; var DATA = null; var orig = null;
  function fire(code) { var l = listeners.find(function (x) { return x.code === code; }); if (!l) return; window.__refired++; window.__ev.push('value->render'); l.cb({ val: function () { return DATA; }, exists: function () { return true; } }); }
  function install() {
    if (!window.firebase || !window.firebase.database || orig) return;
    orig = window.firebase.database().ref;
    window.firebase.database = function () { return { ref: function (p) {
      var r = orig(p); var parts = String(p).split('/').filter(Boolean); var on0 = r.on;
      r.on = function (ev, cb) { if (ev === 'value' && parts.length === 2 && parts[0] === 'events') listeners.push({ code: parts[1], cb: cb }); return on0.call(r, ev, cb); };
      r.set = function (v) {
        if (parts[0] === 'events' && listeners.length) {
          var code = listeners[0].code;
          if (!DATA) DATA = JSON.parse(JSON.stringify(window.__STUBDB.events[code]));
          if (parts[1] === code && parts[2] === 'scores') { DATA.scores = DATA.scores || {}; DATA.scores[parts[3]] = v; }
          fire(code);
        }
        return Promise.resolve();
      };
      return r;
    } }; };
    window.__remoteRoster = function (order) { var code = listeners[0].code; if (!DATA) DATA = JSON.parse(JSON.stringify(window.__STUBDB.events[code])); var byId = {}; DATA.players.forEach(function (p) { byId[String(p.id)] = p; }); DATA.players = order.map(function (id) { return byId[String(id)]; }); window.__ev.push('REMOTE-ROSTER'); fire(code); };
    window.__remote = function (patch) { var code = listeners[0].code; if (!DATA) DATA = JSON.parse(JSON.stringify(window.__STUBDB.events[code])); DATA.scores = Object.assign({}, DATA.scores || {}, patch); window.__ev.push('REMOTE'); fire(code); };
  }
  var t = setInterval(function () { install(); if (orig) clearInterval(t); }, 1);
})();`;
const TRACE_ONLY = REFIRE.slice(0, REFIRE.indexOf('var listeners = [];')) + '})();';

module.exports = { REFIRE, TRACE_ONLY };
