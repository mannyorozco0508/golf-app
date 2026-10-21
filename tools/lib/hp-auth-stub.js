// ============================================================================
// URGENT-048 part 3 - TEST STAND-IN for 048 part 1 (window.HardPanAccountUI),
// same shape: openSignIn() / openProfile(). Until 048-signin lands.
// HardPanAuth is the REAL hp-auth.js (048 part 2, 505379f): hpAuthScript() loads it
// on a page that has no tag for it yet (its own helper adds the page tags), and
// the cold-arrival `auth` option sets who is signed in; window.__signInAs flips it.
// Injected by a Chrome check as a preScript. Test-only: never shipped.
//   window.__hpUI.opened counts openSignIn() calls.
// ============================================================================
'use strict';
function accountUIStub() {
    return `(function () {
  var ctl = window.__hpUI = { opened: 0, profile: 0 };
  var accountUI = { openSignIn: function () { ctl.opened++; }, openProfile: function () { ctl.profile++; } };
  if (!window.HardPanAccountUI) window.HardPanAccountUI = accountUI;
})();`;
}
// The real hp-auth.js, only when the page does not load it itself.
function hpAuthScript() {
    return `document.addEventListener('DOMContentLoaded', function () {
  if (window.HardPanAuth || document.querySelector('script[src$="hp-auth.js"]')) return;
  var s = document.createElement('script'); s.src = 'hp-auth.js'; document.head.appendChild(s);
});`;
}
module.exports = { accountUIStub, hpAuthScript };
