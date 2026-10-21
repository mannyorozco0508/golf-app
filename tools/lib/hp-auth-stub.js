// ============================================================================
// URGENT-048 part 3 - TEST STAND-INS for 048 part 2 (window.HardPanAuth) and
// part 1 (window.HardPanAccountUI), with the same shape:
//   HardPanAuth.state()  -> { signedIn, anonymous, uid, name, initial, provider }
//   HardPanAuth.onChange(fn) -> unsubscribe
//   HardPanAccountUI.openSignIn() / openProfile()
// Injected by a Chrome check as a preScript (before any page script). The page's
// own scripts can't replace them (assignments are ignored), so a check keeps
// control of "signed in" even once the real files land. Test-only: never shipped.
//
//   authStub({ signedIn: false, signInOnOpen: true })
//   window.__hpAuth.set(true) flips it from a step; window.__hpAuth.opened counts
//   openSignIn() calls.
// ============================================================================
'use strict';
function authStub(opts) {
    const o = Object.assign({ signedIn: false, signInOnOpen: false }, opts || {});
    return `(function () {
  var signed = ${o.signedIn ? 'true' : 'false'}, fns = [];
  var ctl = window.__hpAuth = { opened: 0, profile: 0, set: function (v) { signed = !!v; fns.slice().forEach(function (f) { try { f(api.state()); } catch (e) {} }); return 'auth ' + signed; } };
  var api = {
    state: function () { return signed ? { signedIn: true, anonymous: false, uid: 'u-test', name: 'Ann Able', initial: 'A', provider: 'apple.com' }
                                       : { signedIn: false, anonymous: true, uid: 'anon-test', name: null, initial: null, provider: 'anonymous' }; },
    onChange: function (f) { fns.push(f); return function () { fns = fns.filter(function (x) { return x !== f; }); }; }
  };
  var accountUI = { openSignIn: function () { ctl.opened++; ${o.signInOnOpen ? 'setTimeout(function () { ctl.set(true); }, 150);' : ''} }, openProfile: function () { ctl.profile++; } };
  Object.defineProperty(window, 'HardPanAuth', { configurable: true, get: function () { return api; }, set: function () {} });
  Object.defineProperty(window, 'HardPanAccountUI', { configurable: true, get: function () { return accountUI; }, set: function () {} });
})();`;
}
module.exports = { authStub };
