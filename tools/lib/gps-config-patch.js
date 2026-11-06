'use strict';
// ============================================================================
// A STAND-IN CONFIG PATCH FOR CHROME CHECKS (preScript). Sets the given keys on
// HARDPAN_GPS_CONFIG as gps-config.js assigns it, composed with any stand-in
// config already put there (the same chaining as tools/lib/iap-stub.js), so the
// page's own scripts read the shipped config plus these keys.
//
// 2.0.1 shipped round chat OFF (gps-config.js chat: false); 2.0.2 ships it ON. The chat
// checks still set it here so they test the chat code whatever the shipped config says:
// configPatch({ chat: true }) / configPatch({ chat: true, chatPhotos: true }); the switch's
// own control uses configPatch({ chat: false }).
// ============================================================================
function configPatch(keys) {
    return `
(function () {
  var add = ${JSON.stringify(keys || {})};
  var patch = function (v) { if (v && typeof v === 'object') Object.keys(add).forEach(function (k) { v[k] = add[k]; }); return v; };
  var d = Object.getOwnPropertyDescriptor(window, 'HARDPAN_GPS_CONFIG');
  if (d && (d.get || d.set)) {
    var g0 = d.get, s0 = d.set;
    Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return patch(g0 ? g0.call(window) : undefined); }, set: function (v) { if (s0) s0.call(window, patch(v)); } });
  } else {
    var c0 = d ? patch(d.value) : undefined;
    Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return c0; }, set: function (v) { c0 = patch(v); } });
  }
})();`;
}
module.exports = { configPatch };
