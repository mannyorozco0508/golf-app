// ============================================================================
// URGENT-048 part 3 - TEST COUNTER around 048 part 1 (window.HardPanAccountUI).
// Since int-048 settlement.html loads the REAL hp-account-ui.js, so the prompt's
// Sign in opens the real sign-in sheet. accountUIStub() no longer replaces it: it
// WRAPS whatever HardPanAccountUI the page installs, counting openSignIn() /
// openProfile() calls and then calling through to the real sheet. Only on a page
// without the real file does its own stand-in (counting only) answer.
// HardPanAuth is the REAL hp-auth.js; hpAuthScript() loads it only on a page that
// has no tag for it, and the cold-arrival `auth` option sets who is signed in;
// window.__signInAs flips it.
// Injected by a Chrome check as a preScript. Test-only: never shipped.
//   window.__hpUI.opened counts openSignIn() calls; __hpUI.real = the real UI is in.
// ============================================================================
'use strict';
function accountUIStub() {
    return `(function () {
  var ctl = window.__hpUI = { opened: 0, profile: 0, real: false };
  var stand = { openSignIn: function () { }, openProfile: function () { } };
  function wrap(u) {
    if (!u || u.__hpCounted) return u;
    var o = u.openSignIn, p = u.openProfile;
    u.openSignIn = function () { ctl.opened++; return typeof o === 'function' ? o.apply(u, arguments) : undefined; };
    u.openProfile = function () { ctl.profile++; return typeof p === 'function' ? p.apply(u, arguments) : undefined; };
    u.__hpCounted = true;
    if (u !== stand) ctl.real = true;
    return u;
  }
  var cur = wrap(stand);
  Object.defineProperty(window, 'HardPanAccountUI', { configurable: true, enumerable: true,
    get: function () { return cur; }, set: function (v) { cur = wrap(v); } });
})();`;
}
// The real hp-auth.js, only when the page does not load it itself.
function hpAuthScript() {
    return `document.addEventListener('DOMContentLoaded', function () {
  if (window.HardPanAuth || document.querySelector('script[src$="hp-auth.js"]')) return;
  var s = document.createElement('script'); s.src = 'hp-auth.js'; document.head.appendChild(s);
});`;
}
// A page WITHOUT sign-in (a build that does not ship hp-auth.js): HardPanAuth never
// appears, whatever the page loads.
function noAuthScript() {
    return `Object.defineProperty(window, 'HardPanAuth', { configurable: true, get: function () { return undefined; }, set: function () { } });`;
}
module.exports = { accountUIStub, hpAuthScript, noAuthScript };
