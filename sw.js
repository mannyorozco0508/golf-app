// GolfApp Service Worker
// Purpose: let the app shell (HTML/CSS/JS) load instantly and work offline.
// This does NOT touch Firebase's live data sync - Realtime Database uses its
// own WebSocket connection and offline handling, completely separate from this.
//
// Bump this version string any time you want to force everyone's cached shell
// to refresh (e.g. after a big update). Old caches are cleaned up automatically.
// WHY THIS VERSION MOVED
//
// It sat at 'golfapp-v1' through every batch of this project. The fetch handler is
// network-first, so an online browser does get fresh files - but an installed PWA on
// iOS routinely paints from cache first, and anything already stored under a cache key
// that never changes is never invalidated. That is how a device kept rendering a
// scorecard whose markup had been deleted from the repo weeks earlier.
//
// Bumping the key makes the activate handler delete every older cache outright, so the
// next launch is guaranteed to be the deployed build. Bump it whenever the app shell
// changes in a way people must see. Moved to v4 because the shell list below gained
// pool-engine.js, and again to v5 when pwa-boot.js joined it - every already-installed
// device is carrying a cache that is missing whatever the newest entry is.
// Moved to v6 because the shell list below gained the three Tournament Mode files.
// They were shipped to the mobile bundle by sync-mobile-web.js but never precached
// here, so Tournament Mode only worked offline if it had been opened online first -
// exactly the wrong failure for a buddies trip, where the first launch may well be
// at a remote course with no signal.
// Moved to v7 because the shell gained the two local Firebase SDK files. Until
// this bump reaches a device, an installed PWA keeps its v6 cache and would never
// fetch them.
// Moved to v8 after a physical-device session where it was genuinely unclear whether
// the phone had loaded the newly deployed index.html or was painting an older cached
// shell. The shell FILE LIST is unchanged here; the key moves purely so the activate
// handler drops every older cache and the next launch is provably the deployed build.
// Ambiguity about which build is on the phone costs more than a single cold fetch.
// Moved to v9 because index.html - a shell file - changed again: the handicap-dot
// context gained an Auto mode that merges independent side matches, plus a start-hole
// gate on which holes draw match dots. The shell FILE LIST is unchanged; the key moves
// so an installed PWA cannot keep painting the v8 scorecard.
// Moved to v10 because index.html - a shell file - changed again: marks on the
// primary gross score are now gross-only (boxes), and a subordinate net-birdie
// indicator was added beneath it. The shell FILE LIST is unchanged; the key moves so
// an installed PWA cannot keep painting the v9 card, which circled gross pars.
// Moved to v11 because two precached files changed: bet-strip.js now resolves each
// press's own stake instead of the round's base stake, and index.html renders that
// amount plus the start hole on the collapsed ladder and offers a press-amount
// picker. An installed PWA on v10 would keep telling a golfer that a $50 press is
// $20. The shell FILE LIST is unchanged.
// Moved to v12 because admin.html - a precached shell file - changed: the course
// Par/HCP grid no longer reseeds itself on every outside tap, and a completed card is
// now validated at the Next/save boundary. On v11 an installed PWA would keep the
// build where a golfer literally cannot enter an unmapped course. Shell list unchanged.
// Moved to v13 to force every installed PWA to drop its cached shell. Six precached
// pages - admin, leaderboard, settlement, stats, skins, sidematches - carried a
// date-based kill switch that blanked the page once a hardcoded date passed. Without
// this bump an installed app would keep serving the expired shell from cache and stay
// dark even though the deployed fix is live. Shell FILE LIST unchanged.
// Moved to v14 because sidematches.html - a precached shell file - changed: the
// Matches tab now loads settlement-engine.js and uses the canonical stroke engines
// instead of its own p1/p2-only copies. On v13 an installed PWA would keep painting
// the build where a 2v2 Stroke Play match reads ALL SQUARE and $0 on the tab that
// created it while the Receipt pays it out. The shell FILE LIST is unchanged -
// settlement-engine.js was already precached for settlement.html.
// Moved to v15 because sidematches.html - a precached shell file - changed again:
// the side picker now offers 2v2 for Stroke Play as well as Match Play and Nassau,
// and the instruction line no longer tells golfers 2v2 is unavailable to them. On
// v14 an installed PWA would keep refusing the second golfer on a Stroke side and
// keep printing copy that contradicts what the app now settles. Shell list unchanged.
// Moved to v16 because stats.html - a precached shell file - changed: the Final
// Scorecard now loads settlement-engine.js and uses the canonical stroke engines
// instead of its own p1/p2-only copies. On v15 an installed PWA would keep printing
// $0.00 for a 2v2 Stroke Play side match on the card the group actually keeps,
// while the Receipt paid it. The shell FILE LIST is unchanged - settlement-engine.js
// was already precached for settlement.html and sidematches.html.
// Moved to v17 for the shared-core wave. One new precached file - grouping.js -
// now carries the group-sizing rule that used to be duplicated inside four pages.
// An installed PWA on v16 does not have it cached, and the pages call it unguarded,
// so it would not degrade quietly: it would break. The shell FILE LIST grew by
// exactly that one entry and nothing else.
//
// The handicap half of this wave was deliberately NOT shipped - see the wave
// report. Extracting it from money-engine.js is a correct change that 82 test
// suites are wired against, and that is a separate, planned piece of work rather
// than something to slip in behind a cache key.
// Moved to v18 because the handicap family - parseHcp, getStrokes and the relative
// match handicap functions - moved out of money-engine.js and five page copies into
// handicap.js, and eight pages now load it. An installed PWA on v17 has no copy of
// that file, and the pages call into it unguarded, so it would break rather than
// quietly miscalculate a stroke. The shell FILE LIST grew by exactly one entry.
// Moved to v19 for the payout extraction and the product shell declarations. One
// new precached file - payouts.js - now carries the place and tie prize rule that
// was written out twice, in trip.html and tournament-engine.js. Four pages call it
// unguarded, so an installed PWA on v18 would break the prize table rather than
// quietly misallocating a pot. The shell FILE LIST grew by exactly that one entry;
// the shell DECLARATIONS added alongside it change no runtime behaviour.
// Moved to v20 because the shell gained product-links.js, the seam that lets a
// cross-product link survive the two deployments now built by build-shell.js.
//
// THIS IS THE COMBINED DEPLOYMENT'S KEY, and it stays 'golfapp-' prefixed. The two
// split outputs generate their own workers with their own keys - consumer-v20-split
// and tournament-v20-split - so all three cache identities are distinct and none
// can evict another.
// Moved to v21 for the product boundary wave. admin.html lost the Tournament home
// tile and gained a deliberate outbound route; trip.html tells the truth about what
// its button does; tournament-scorecard.html gained identity and save-state feedback;
// tournament.html now writes both relationship pointers. All four are precached shell
// files, so an installed PWA on v20 would keep showing a Tournament tile this product
// no longer owns. Shell MEMBERSHIP is unchanged - no file was added or removed.
// Moved to v22 for the flights/divisions wave. tournament.html and
// tournament-engine.js changed - both precached shell files - so an installed PWA on
// v21 would keep an organizer page with no flight management on it. Shell MEMBERSHIP
// is unchanged: flights are a node inside the existing tournament record, not a new
// runtime module.
// Moved to v23 for the player identity wave. tournament.html,
// tournament-scorecard.html, tournament-engine.js and handicap.js all changed, and
// the two tournament pages now load handicap.js - a file already in the shell but
// not previously requested by them. An installed PWA on v22 would hold an organizer
// page with no player field and a scorecard that cannot open a group link. Shell
// MEMBERSHIP is unchanged: handicap.js was already precached for Consumer.
// Moved to v24 for the multi-round wave. tournament.html, tournament-engine.js and
// tournament-scorecard.html all changed - an organizer page with no round management
// on it, and a scorecard that cannot read ?round=, would leave an installed PWA on
// v23 unable to score the second day of a championship. Shell MEMBERSHIP is
// unchanged: rounds live inside the existing tournament record.
// Moved to v37 because skins.html - a precached shell file - changed: the Skins
// card is now gated on roundHasSkinsGame() and the page loads action-model.js to
// ask it. An installed PWA on v36 would keep drawing a buy-in box and a payout
// ledger for a Skins game nobody is playing. Shell MEMBERSHIP is unchanged:
// action-model.js was already precached for Consumer.
// Moved to v38 because skins.html and stats.html - both precached shell files -
// changed. The Bets tab now tells the truth about which Skins games it can see,
// and both pages build the round code into their injected Receipt link instead
// of relying on a boot-time rewrite that had already run. An installed PWA on
// v37 would keep paying an imaginary leader out of a leftover buy-in, and keep a
// Receipt button that drops the round. Shell MEMBERSHIP is unchanged.
// Moved to v39 because admin.html - a precached shell file - changed: Round Setup
// no longer saves a Skins buy-in for a round that is not playing Skins, and now
// carries the Pot Format choice that only skins.html could set before. An
// installed PWA on v38 would keep writing the leftover buy-in on every new round
// it created. Shell MEMBERSHIP is unchanged.
// Moved to v40 for the Main Pool batch. Five precached shell files changed:
// admin.html (previewCourseData seam, the pool restore fix, KP auto-fill, the
// allocation breakdown), index.html and settlement.html (the Main Pool label),
// action-model.js and settlement-engine.js (the shared MAIN_POOL_LEDGER_LABEL).
// An installed PWA on v39 would keep ERASING a round's Main Pool on every
// re-save, which is the one change here that loses data. Shell MEMBERSHIP is
// unchanged; data.moneyPool is unchanged; no settlement arithmetic moved.
// Moved to v41 for the 1.0 release batch. Four precached files changed:
// admin.html (scanner removed, organizer token and settlement mode preserved on
// re-save), trip.html (re-link no longer resets a round; no Tournament route in
// the native shell), pwa-boot.js (exposes the native check), manifest.json
// ("game tracker", not "betting tracker"). An installed PWA on v40 would keep
// offering a camera scanner this build no longer supports, and would keep
// reminting the organizer token on every save. Shell MEMBERSHIP is unchanged; no
// settlement arithmetic moved.
// Moved to v42 because Print / Save was dead in the native app. window.print()
// is a silent no-op inside WKWebView, so settlement.html and trip.html now route
// through native-export.js: the browser still prints, and iOS gets a real PDF
// built from the rendered Receipt plus the system share sheet. New precached
// file: native-export.js. An installed PWA on v41 would keep the dead button and,
// worse, would load pages that call a helper it has never cached.
// Moved to v43 because v42's native export never ran. Two defects: settlement.html
// and trip.html did not load pwa-boot.js, so GolfNet was undefined and the exporter
// took the BROWSER path into window.print() - a silent no-op in WKWebView; and the
// plugins were read from Capacitor.Plugins, which @capacitor/core never populates
// without a bundler. Both pages now load the detector, plugins come from
// Capacitor.registerPlugin(), and a Capacitor build can no longer fall through to
// print. Shell MEMBERSHIP is unchanged: pwa-boot.js was already precached.
// Moved to v44. v43 reached the native path correctly but then refused to export:
// it demanded Capacitor.registerPlugin, which the natively injected bridge does
// NOT define. JSExport.swift injects Capacitor.Plugins['Filesystem'] directly at
// documentStart, so the plugins were present all along. Resolution now reads
// Capacitor.Plugins first and keeps registerPlugin only as a bundler fallback.
// Shell MEMBERSHIP unchanged; no dependency, permission or money-math change.
// Moved to v45. The native Print / Save control is hidden: window.print() is a
// no-op in WKWebView and four builds of Capacitor Filesystem + Share never got an
// export working on a device, so Consumer 1.0 stops offering a button that fails.
// The Receipt is unchanged and still shows every figure; browser and PWA still
// print normally. The export plumbing stays in the repo, unreachable from the
// native UI. Shell MEMBERSHIP unchanged; no dependency, permission or money change.
// Moved to v46 because the shell list below gained ryder-cup.js. index.html now
// loads it unguarded at parse time, so an already-installed PWA holding a v45
// cache would serve a scorecard whose Ryder Cup card never renders. A bump is the
// only thing that reaches those devices.
// Moved to v47 because sidematches.html gained the Ryder Cup setup surface and
// now loads ryder-cup.js. An installed PWA on v46 would serve a Matches page that
// cannot create a Cup, with no signal that anything is missing.
// Moved to v48: index.html gained the Cup resolver and cross-event host load, and
// sidematches.html gained the five-session schedule. An installed PWA on v47 would
// serve a scorecard that cannot follow a ryderCupRef at all.
// Moved to v49: index.html gained Foursomes team score entry and sidematches.html
// gained the scratch/handicap choice. An installed PWA on v48 would serve a
// scorecard that cannot enter an alternate-shot score at all.
// Moved to v53: index.html gained the D1 fix - the match-handicap line is cloned
// into Hole View, so a golfer can finally see WHICH handicaps the dots are using
// without switching views. An installed PWA on v52 would keep serving the card
// where that line renders only inside the Full Card, which is the entire defect.
// Moved to v54: admin.html and sidematches.html gained the priced Auto Press
// Amount option, and action-model.js the shared builder behind it. An installed
// PWA on v53 would keep serving "Same as Segment" - the exact label nobody could
// read - so the golfers most likely to have the app installed would be the only
// ones who never saw the fix.
// Moved to v55: admin.html and sidematches.html now price the Auto Press option
// as the control is REVEALED, not only when a stake is typed in. An installed PWA
// on v54 would keep serving the version that shows the bare "Same as Segment"
// fallback to anyone who accepts the default 10/10/20 stakes - which is most of
// them, and is why v54 looked fine in a browser tab and broken on a phone.
// Moved to v56: the Auto Press option no longer says "Segment" anywhere a golfer
// reads it - the priced option, the collapsed single-bet form, the sub-line and the
// pre-script fallback in both pages all say "bet" now. An installed PWA on v55 would
// keep serving the jargon this change exists to remove.
// Moved to v57: admin.html now issues STABLE player ids. A row is stamped with
// data-player-id once and keeps it, so deleting or reordering a golfer can no
// longer renumber everyone below them. That id is the primary key for money -
// scores live at p{id}_h{hole} - so an installed PWA on v56 would keep serving a
// wizard that silently hands one golfer another's scorecard.
// Moved to v58: a Ryder match now stores the format it was seeded with.
// buildRyderCupConfig flattened every non-singles format to fourball, so a
// Classic Cup saved its Foursomes sessions as Four-Ball - the entry screen
// offered alternate shot while the scorer read individual scores that alternate
// shot never produces. An installed PWA on v57 would keep writing that record.
// Moved to v59: the Foursomes team-score card is finally wired into Hole View.
// Phase 5 built the whole alternate-shot entry and never called it from any render
// path, so a golfer in a Foursomes session had no way to enter a score while the
// engine banked points for it. An installed PWA on v58 would keep serving the
// scorecard that cannot score the format its own schedule asks for.
// Moved to v60: a round can finally say which Cup session it is. Phase 4 designed
// the pointer - data.ryderCupRef = { host, sessionId } - and nothing ever wrote
// it, so every round resolved with a null session and anything session-scoped
// silently did nothing. An installed PWA on v59 would keep serving a Cup setup
// with no way to answer the question.
// Moved to v61: arriving to set up a Cup lands on the Cup. The setup surface moved
// out of the card headed "Side Matches (Cross-Group)", side action collapses on
// ?setup=ryder, and rcRefresh() is finally called - without it the Cup surface
// never rendered at all, because every render call sat inside a handler fired by
// buttons that only exist inside the markup that render produces. An installed PWA
// on v60 would keep serving a Matches page with no Cup on it.
// Moved to v62: a back control on the two action-setup pages, and the side-matches
// card is REMOVED from the Cup arrival rather than collapsed. v61 collapsed it,
// which still put side betting on the screen of somebody sent to build a Cup;
// the collapse machinery went with it. An installed PWA on v61 would keep
// serving the collapsed version and both pages would still have no way back.
// Moved to v63: a Cup can finally be played on a round that did not create it.
// Player ids are per-round and positional, so the Cup's ids name different people
// on every other round; ryder-cup.js now translates them by NAME, the same bridge
// Trip Mode uses, and REFUSES when the names cannot identify anyone - placeholders
// or duplicates. action-model.js carries the shared normaliser, so both files in
// the shell list changed. An installed PWA on v62 would resolve a Cup onto whoever
// happened to line up positionally, and silently swap the two sides.
// Moved to v64: the session badge on the Classic schedule stops answering two
// questions in one shape. "1 matches" was CAPACITY - how many a session seats -
// and read exactly like a count of lineups created, so on a four-golfer Cup every
// session showed it and setting one lineup looked like it had written pairings
// into all five. It never had. Capacity now says "seats 1 match"; a created
// lineup says "1 lineup set". An installed PWA on v63 keeps the label that
// caused a real organizer to report a fan-out bug that was not happening.
// Moved to v65: the free-form "+ Four-Ball" / "+ Singles" adder stops creating
// matches nobody can use. It pushed a pairing whether or not it found anybody, so
// once every assigned golfer was already playing it could only produce "- vs -";
// and it filed into session 's1', which the Classic schedule does not contain, so
// even a FILLED match added that way belonged to no session - invisible in every
// badge and never scored. The row is no longer rendered where a schedule exists,
// and the handler refuses instead of pushing a blank. An installed PWA on v64
// keeps two buttons that can only block its own Save.
// Moved to v66: the entry screens stop framing the job as something else. The
// home asked "What are you setting up?", offered two tiles, and then offered a
// separate button underneath to actually begin - so the tile that looked like the
// answer only ticked itself. Picking a tile starts the round now, and the button
// and its orphaned "OR" are gone. And the Cup arrival loses the side-betting
// chrome v62 left standing above the card it removed: the page heading, named
// after the round so it read as the subject, and the pointer to the Bets page.
// An installed PWA on v65 keeps a home with two ways to start and a Cup screen
// headed "Side Matches".
// Moved to v67: a Cup that refuses now says what is wrong and what to do. v63
// taught the resolver to refuse rather than name the wrong golfers, and it
// refused SILENTLY - "Cup unavailable", which is true and useless. A golfer on
// Day 2 got no Cup, no cause, and no idea that a name typed on a different round
// was the reason. All three unusable states now name themselves, and the Cup can
// no longer be CREATED on golfers who are unnamed or share a name, which is where
// the fix is cheap. Scoring is unblocked throughout. An installed PWA on v66
// keeps a Cup that disappears without explaining itself.
// Moved to v68: the home shows what is actually used, and every page can get
// back. "ENTER GAME CODE" and "Join Game" are gone - confirmed that nobody has
// ever typed a code, because a golfer arrives on a link the organizer sends, and
// every real way in (the round link, a group's scorekeeper link, the read-only
// follow link, a deep link carrying eventType) reads the URL and never went near
// joinRoom. Legacy 4-character codes still open: the link path applies no length
// rule at all. Resume shrinks from a full-width primary button to a small link,
// the brand mark grows to lead the screen and the wordmark shrinks to support it,
// and settlement, stats, leaderboard and both trip screens gain the back control
// Matches and Bets already had. An installed PWA on v67 keeps a home asking for a
// code that goes nowhere, and four pages with no way out.
// Moved to v69: "Resume" means a round that exists. The pointer was written on
// page load, the instant the URL carried ?game=CODE, and the round is not written
// to Firebase until Save & Start Round - the whole setup wizard in between. Open
// the wizard, back out, and the phone offered to resume a round that was never
// created; tapping it said "Waiting for Admin to save settings", blaming an absent
// person for a round nobody had made. v68 made it easier to hit, because picking a
// tile mints a code immediately. The pointer is now written on save, and a round
// that comes back empty AND matches this device's own pointer clears it and says
// so - while a player who is merely early still sees the wait, which is true for
// them. Also: the never-used duplicate control leaves the home screen (its
// copyFrom prefill is untouched), and the resume link gets the flex gap it needed
// to stop rendering as "ResumeJLRL4H". An installed PWA on v68 keeps offering dead
// rounds.
// Moved to v70: the trip total tells the truth about itself, or shows no number.
// The money card ended by claiming it counted the main format only and that side
// games, side matches and one-off side bets were still to come. That was FALSE -
// the trip sums computeCombinedNetTotals, which counts every one of them, and a
// $50 side match moves a golfer's total from +$10 to +$60. A group reading that
// line settles their side matches SEPARATELY, on top of a total that already
// contains them, and pays twice - while nothing on screen looks broken. It now
// states what IS included, from a list held against what the engine emits.
// And the trip-wide total refuses when a name cannot identify a golfer: two men
// called Mike Dunne were merged into one balance, four golfers in and three out,
// with "Lance Webb -> Mike Dunne $10" naming either of them. Scoring, the
// leaderboard and each round's own money are untouched. An installed PWA on v69
// keeps a card that invites the group to double-pay every side match.
// Moved to v71: a round's own receipt refuses two golfers it cannot tell apart.
// Every settlement total is keyed on the NAME, so two men called Mike Dunne were
// ONE balance - four golfers in, three out - and "Lance Webb -> Mike Dunne $10"
// named a man who could be either of them. v70 made the TRIP total refuse this;
// this is the same bug one level down, on the receipt cash actually changes hands
// on. Both surfaces that show a round's money refuse from one shared detector in
// action-model.js, so they cannot disagree about whether a receipt is safe to pay
// from. Placeholders are deliberately NOT refused here: inside a single round
// Player 1..4 are distinct and nothing merges. An installed PWA on v70 keeps
// printing a merged balance that looks finished.
// Moved to v72: the setup page describes its own link instead of guessing at it,
// the destructive control stops being the loudest thing on the page, and the page
// finally has a way back. The share card claimed unconditionally that its QR was a
// read-only spectator link; on four golfers that link is fully writable - 76 of 76
// score inputs editable - so it IS the scorekeeper link, and the sentence was wrong
// on nearly every round this group plays. It nearly got the card deleted, which
// would have left a four-ball with no way to share a round at all. An installed PWA
// on v71 keeps a page that mislabels its own link and shouts about deletion.
// Moved to v73: a Nassau settles at the stakes it was set up with. A wager typed
// as $10 front / $10 back / $20 overall saved correctly and then settled every
// segment at $20 - and because each auto-press inherits its segment's price, the
// cascade multiplied it: $200 on a round whose face value was $40. The delta was a
// MULTIPLE, not a fixed overcharge, and it scaled with how hard the presses ran.
// calculateMatchEngine always took a stakeConfig and priced each segment from it;
// three call sites never passed it, and bet-strip's flattening dropped the fields
// before the live view saw them. Four call/shape changes, no arithmetic. Legacy
// single-stake and uniform wagers settle byte-identically, so nothing already paid
// in cash moves. An installed PWA on v72 keeps overcharging every split-stake
// Nassau it settles.
// Moved to v74: share links are links somebody else can open. Inside the iOS
// wrapper the page is served from capacitor://localhost, so every URL built from
// the page's own location came out as capacitor://localhost/index.html?game=CODE -
// useless the moment it was pasted into a text. That broke the invite link, the
// QR, every group scorekeeper link, the private organizer link, the follow link,
// the trip link and the tournament team link AT ONCE, because all of them read
// location.origin. Sharing a round from the native app was impossible.
// product-links.js - already "the one place that knows the two products may not
// live at the same origin" - now owns the rule: this page's own origin on
// http/https so preview deploys and local dev share links to themselves, and the
// canonical web origin anywhere else. index.html and leaderboard.html load it now.
// An installed PWA on v73 keeps handing out links nobody can open.
// Moved to v75: you share a round after it exists, and a bet you set up is still
// there when you save.
//   The share card sat on the SETUP screen at step one, offering a link to a round
// with no format, no course and no players yet - and the group-links panel beside
// it hid itself whenever there was one group, which is most of this group's golf.
// Sharing moved to the Round Ready screen, where the round is real and the groups
// are known: one labelled copyable link per group, rendered on arrival rather than
// behind a "Group Links" button nobody pressed. A single group used to get a
// SENTENCE there telling the organizer to read the round code aloud; it now gets a
// real link like everybody else. The Ryder Cup handoff, which skips Round Ready
// entirely, gained the same panel. The QR and its runtime CDN script went with the
// card - a per-group link cannot be one QR, and a third-party fetch on the
// most-used screen fails offline inside the native bundle.
//   And the wizard silently deleted a configured Nassau. Arriving at the Games step
// rewrites the two golfer dropdowns with innerHTML, which resets a <select> in a
// real browser, so one tap of "◀ Back" emptied the pairing while leaving the
// checkbox ticked and the stakes typed - and the round then saved with NO BET and
// said nothing. The pairing is remembered outside the markup now. The Review step,
// which had never mentioned side matches at all, shows the wager bound to
// collectSetupNassauWager() - the same function the save calls - so it cannot
// promise a bet that will not be written or stay silent about one that will.
// An installed PWA on v74 can still create a foursome's round with nothing to send
// anybody, and still lose a $40 Nassau to the Back button without a word.
// Moved to v76: the FULL leaderboard is the full field, and its footer can finally
// say when it is not.
//   Tapping "Full Leaderboard" on the scorecard called liveStandings() with no
// argument, which scopes to the group being scored - so a Group 1 scorekeeper on a
// twelve-golfer round opened the full board and was shown four people. Three
// separate comments said whole field: the overlay markup, renderLiveBoard() and the
// footer, whose stated job is to confirm nobody is missing.
//   THE FOOTER COULD NEVER HAVE SAID SO. It was built as
// 'Showing ' + shown + ' of ' + shown - the same variable twice - so it read
// "Showing 4 of 4" on a field of twelve. The test guarding it was named "the footer
// confirms the whole field is present" and set no group lock, exercising the one
// state where the two numbers legitimately agree. It now drives a real ?group=1
// link and fails without this fix.
//   The expanded board now defaults to the whole field with a By Group / All
// Players toggle - the same two choices the Leaderboard page offers, under the same
// names, built from a button and a class rather than a <details>, and not persisted.
// The second number in the footer is the round's real player count, so narrowing
// reads "Showing 4 of 12".
//   THE COMPACT CARD IS UNCHANGED and still scoped to the foursome being scored.
// group_scope_test.js holds that rule and a new suite asserts it again, so widening
// the overlay cannot quietly widen the working view with it.
//   Also carries the Skins carry-rule copy from the previous commit: "void" was
// app-only jargon and left three surfaces for Carry Over / No Carry.
// An installed PWA on v75 still shows a group scorekeeper four golfers under a
// heading that says Full Leaderboard, and a footer that agrees with itself.
// Moved to v77: a game code opens the round again - and opens the ROUND, not the
// organizer's wizard.
//   v68 removed the home screen's code field on the evidence that golfers arrive on
// a link. That evidence still holds, so what comes back is one compact row under
// Resume rather than a full-width field above a full-width button competing with
// the two tiles. Both halves stay a 44px target.
//   WHAT DOES NOT COME BACK IS THE DESTINATION. joinRoom() sent a typed code to
// admin.html?game=CODE, which lands on wizard step 7 - the organizer's Review -
// with "Save & Start Round" on screen, measured at four golfers and at nine. A
// golfer who typed the code somebody read out arrived holding the control that
// rewrites the round. openRoundByCode() opens the scorecard instead.
//   It also accepts a PASTED LINK and keeps the group that link carried, because a
// link is what an organizer actually sends. A bare code never acquires a group:
// inventing one would hand scorekeeper rights over another foursome to anybody who
// knows the code. Above four golfers a typed code is therefore read-only, and the
// note beside the field says so - measured, not asserted, by
// tools/code-entry-check.js, which types a code on a four-golfer round and on a
// nine-golfer one and counts what each can actually edit.
// An installed PWA on v76 has no way in from a code at all.
// Moved to v78: the awards screen stops crediting the wrong man, and stops
// printing escape sequences at people.
//   FOUR LITERAL \uXXXX ESCAPES were rendering as text. Two were on the trip recap
// - "Screenshot this \u2014 or use Share below" and a share button reading
// "\uD83D\uDCE4 Share as Text" - which is the screen whose entire job is to be
// screenshotted into a group chat. A fourth turned up on admin.html the moment a
// cross-page scan existed. A \uXXXX sequence resolves inside a JS string and
// prints literally in raw markup; this is the third time the class has shipped, so
// it is now guarded every page at once, in source AND in rendered text.
//   AWARDS CREDITED TWO GOLFERS AS ONE. Two Mikes on Day 1 produced "Most Birdies:
// Mike Dunne - 5", which is 3 + 2: two men's birdies added together and published
// to everyone who was there. The trip money already refused this through
// tripIdentityProblems(); renderTripAwards() never called it. It refuses now, names
// the golfer and the fix, and empties cachedAwards so the refusal reaches BOTH
// recap surfaces rather than only the panel.
//   A PAR WAS CROWNED THE BIGGEST BLOW-UP. blowUp began null and took the first
// hole through `diff > blowUp.diff` with nothing requiring diff > 0, so a round
// where nobody went over par named somebody's par. Two over or it is not a
// blow-up, and when nobody blows up it says so instead of vanishing.
//   AND THE FIFTH COPY OF A NAME RULE IS GONE. Awards keyed on raw p.name while the
// leaderboard, the money and the placeholder warning all key through
// normalisePlayerName(), so "Marty" and "marty " split here and merged everywhere
// else. One rule now.
//   Eagles gained their own line. Only diff === -1 was counted, so an eagle earned
// nothing anywhere in the app; folding it into "Most Birdies" would make that label
// untrue and counting it twice would make the number a count of nothing.
// An installed PWA on v77 still merges two golfers' birdies onto one name.
// Moved to v79: a refusal is a property of the TRIP, and the recap obeys it.
//   THE WORST INSTANCE OF THIS BUG FOUND SO FAR. The trip money panel refused to
// show a total when two golfers could not be told apart - "would send money to the
// wrong person" - and the SHARED RECAP TEXT printed "FINAL SETTLEMENT / Zach Hill
// owes Mike Dunne $1" onto the clipboard anyway. That string goes into a group chat
// and gets used to settle up, so the one surface that LEAVES THE APP was the one
// still publishing the merge.
//   It happened because each panel asked the question for itself and the recap
// asked nobody. The gate is now computed once for the trip and everything that
// attributes anything to a golfer obeys it: money, awards, the cumulative board,
// the points race, the recap card and the recap text. It is also self-healing - a
// renderer reached from anywhere else recomputes rather than publishing because
// nobody ran the gate first, which is the same shape as the bug it prevents.
//   THE STANDINGS AND POINTS RACE WERE MERGING TOO, and had been all along. The
// board rendered "Mike Dunne - 4 rounds played" on a TWO-ROUND trip: two men's
// rounds added together into a number that cannot exist, with nothing looking at
// it. tripRoundCountProblems() now asserts the invariant independently of the name
// rule - a golfer's round count can never exceed the rounds that count.
//   The recap text also carries its own context now: how many rounds it covers, a
// caveat when a linked round is excluded from totals, and the sandbagger's number.
// FINAL vs NOT FINAL was verified against a genuinely unresolved round rather than
// assumed; it was already correct.
// An installed PWA on v78 still pastes a merged settlement into the group chat.
// Moved to v80: days 2-5 can finally join the Cup day 1 is holding.
//   THE POINTER EXISTED SINCE v48 AND NOTHING COULD WRITE ONE. rcSave() set
// host: currentMode - a round hosting its OWN Cup - so there was no way to aim a
// round at somebody else's. The Cup card now offers a third choice beside Set Up
// and the Classic preset: join a Cup that already exists, by the host round's code.
//   VALIDATED BEFORE ANYTHING IS WRITTEN. Does the host round exist, does it have a
// Cup, does the picked session exist on it - all three, and a round may not point
// at itself. A pointer aimed at a Cup that cannot load is a poisoned round: every
// load afterwards resolves to an error the golfer cannot clear from the screen it
// appears on.
//   THE REFUSAL NAMED THE WRONG ROUND. ryderTranslateCupToRound always
// distinguished a duplicate on the HOST round from one on THIS round, and
// ryderUnavailableReason discarded that and told everybody to fix the host. An
// organizer whose duplicate was on the joining round - the normal case for days
// 2-5 - was sent to a round where nothing was wrong, which is worse than saying
// nothing: you look, find nothing, and stop believing the message. The engine
// carries `where` now and the sentence names the round that is actually wrong.
//   A DANGLING SESSION IS REFUSED. 'session-missing' was on
// ryderResolutionUsable's allow-list, so a round whose session pointer aimed at
// nothing rendered the WHOLE Cup as though everything were fine.
//   SCORING IS NEVER BLOCKED by any of it - measured, 76 of 76 inputs editable in
// every failure case.
// An installed PWA on v79 has no way to join a Cup at all.
// Moved to v81: skins do not carry unless somebody said so, and the exported
// receipt contains the money.
//   AN ABSENT CARRY RULE MEANT CARRY. Every reader was `!== false`, and three files
// each held their own copy of that decision, so a round that never recorded a rule
// carried anyway. Nobody's mental model of skins is "carries unless stated". Only
// an explicit true carries now, the default lives once in action-model's
// skinsCarriesOver(), and the other two engines ask it instead of repeating it.
//   THIS RESTATES A LEGACY ROUND with skins money and no recorded rule - measured
// at $241 of a $480 pot moving from a twelve-way refund to three winners - so the
// Receipt SAYS which rule it applied when the round never said. Every current
// writer records the field, so no app-created round is affected.
//   THE SKINS SUMMARY COUNTED HOLES WHILE THE HOLE LINE COUNTED SKINS. A golfer who
// won one hole carrying two skins read as "1 skin $35" beside two men on
// "1 skin $17" - one man apparently paid double for the same thing. Both count
// skins now, which is what the money divides by.
//   AND THE EXPORTED RECEIPT HAD NO MONEY IN IT. printReceipt() took
// #settle-content and #receipt-scorecard, which are SIBLINGS of the money sections
// - so on a Main Pool round the PDF was a scorecard plus the sentence "No money
// bets were set up for this round" while $480 sat on screen beside it. No error, no
// empty file, just a plausible document missing the point. The export now takes
// every section that carries money, there is one button instead of two competing
// labels, and the header names the course, the date and the group.
//   trip.html hides the recap overlay when printing; it used to print over the page.
// An installed PWA on v80 carries skins nobody asked to carry and exports a receipt
// with no money on it.
// Moved to v82: every golfer gets a label of their own, and HCP says a handicap.

// Moved to v83: a score the server REFUSED no longer looks exactly like a saved one.

// Moved to v155: the counted awards say how many rounds they came from.
//
// trip.html (precached). Most Birdies and Sandbagger of the Week carry the
// rounds behind the number on a multi-round trip - "12 birdies over 4 rounds",
// "3 birdies in 1 round", "Ann A (4 rounds) and Cal C (1 round) — 3 birdies
// each" - on the panel, the recap card and the share text. The single-event
// awards stay bare; a one-round trip carries no suffix. It changes no winner;
// it says what the count is made of. An installed device on v154 shows the
// bare counts.

// Moved to v154: the trip awards tell the truth.
//
// trip.html (precached). A tie on any award names every golfer at the winning
// figure ("Ann A and Ben B — 3 birdies each"; four or more "… and N more") -
// it used to hand the trophy to whoever the roster listed first, silently.
// Sandbagger of the Week needs handicaps: a golfer's round counts only when
// that round carries one for them, golfers with none are named as left out,
// fewer than two eligible -> "not awarded" and a plain line why; with blank
// handicaps it used to crown the best gross golfer. The recap card now
// carries the Sandbagger's number. A round still in play is named on the
// panel, the card and the share text ("So far — Day 2 is still in play."). An
// installed device on v153 keeps the silent tie and the gross Sandbagger.

// Moved to v153: the share-sheet PDF carries the mark.
//
// native-export.js (precached). The iOS PDF now opens with the brand mark -
// logo-mark.png, taken from the receipt page's own already-decoded element
// (never fetched), flattened on white and embedded as a JPEG image object
// 48 pt square, centred above the course name; the text starts 54 pt lower on
// page 1 and that page holds five fewer lines. Every line, in the same order.
// With no mark on the page the PDF is byte for byte what v152 wrote. An
// installed device on v152 shares a PDF with no mark on it.

// Moved to v152: the shared receipt's header prints once.
//
// settlement.html (precached). printReceipt's export roots named the header
// element AND the summary card that contains it, so the iOS PDF carried the
// course / date / format twice (lines 0-2 and 46-48 of the v151 receipt).
// The summary is now exported as its cards, minus the header and the print
// button; the header stays first; the money's order is unchanged. Nothing on
// screen or in the browser print moved. An installed device on v151 shares a
// PDF with the header twice.

// Moved to v151: the share-sheet PDF reads like the page.
//
// native-export.js (precached). The iOS PDF's lines came from innerText of a
// DETACHED clone of each export root - which the spec resolves to textContent
// - so every card printed on one line with no separators ("Original
// Bet$50Started Hole 1Carp 2&0Carp +$50") and headers kept the source's
// indentation, from Build 13 on. The text is now assembled from the live
// tree: one line per ledger row ("Marty  $310"), blocks on their own lines,
// scorecard cells spaced, nothing that is not rendered; the same characters
// in the same order, proved against the v150 capture. The clone read stays as
// the fallback. An installed device on v150 keeps the run-together PDF.

// Moved to v150: the brand mark on the printed receipt.
//
// settlement.html (precached). buildReceiptHeader carries logo-mark.png -
// the lobby's asset, already in this precache and the native bundle - as a
// print-only <img>: display:none and 0 x 0 on screen (the page's spacing is
// unchanged to the pixel, tools/receipt-logo-check.js), 64 x 64 centred above
// the course name on paper and in a saved PDF. The native text PDF is
// unchanged (innerText carries no image). An installed device on v149 prints
// a receipt with no mark on it.

// Moved to v149: the Receipt reads the same predicate as the trip.
//
// settlement.html (precached). The live/final gate now asks settlement-engine
// .js computeRoundSettlement (v148's predicate) instead of its own two
// questions, so a round the organizer verified with a picked-up ball or a
// golfer who left after nine renders a FINAL receipt for the first time, and a
// roster name that never teed off is not waited for. The live head names who
// is still out ("Still in play — thru 9, 1 golfer still has holes left: Dee D
// (9 of 18)"), a KP-only hold reads "RESULTS — NOT FINAL" instead of blaming
// golfers whose cards are all in, and the six per-game headings drop "Final"
// while the round is not final. No money moved into the live branch. An
// installed device on v148 keeps a Receipt that can never finish a DNF round
// and prints "Final Skins Settlement" under "still in play".

// Moved to v148: the trip tells the truth about what is final.
//
// trip.html (precached) and settlement-engine.js (precached). The trip money
// card now shows BOTH trip totals when they differ - "Settled after each
// round" (each day's rounded Results added up) and "Settled once at the end"
// (every bet netted first, rounded once) - and one number with a sentence
// when they agree; Who Pays Who runs from the settle-once total and says so.
// A counted round still in play is named ("Still in play: Day 2 - thru 9, 1
// golfer still has holes left"), its money counted, and the heading is not
// "Final" until every golfer who teed off has every hole scored or the
// organizer verified the round. settlement-engine.js gained
// computeRoundSettlement, the one predicate for that. An installed device on
// v147 would call a trip Final over a match scored thru 9, and show one total
// where two honest ones differ by a dollar or three.

// Moved to v147: the organizer path - a round has an owner, and the wall
// speaks.
//
// admin.html and trip.html (both precached) load organizer-gate.js (new,
// precached) after auth-boot.js. Every round they create now goes through it:
// authReady awaited, organizers/<uid>/firstSeenAt written first (write-once),
// ownerUid stamped on the round - every round of a trip planner batch - and
// the same update() as before. When the rules refuse the create and the uid's
// window has closed with no pass, the golfer reads the wall, not an SDK error.
// Inside the window nothing changes on screen. An installed device on v146
// would save rounds with no ownerUid and, once the Wave 2 rules are live, be
// refused with "Save error: PERMISSION_DENIED" and no explanation.

// Moved to v146: an anonymous user is not a tournament organizer.
//
// tournament.html only (plus database.rules.json, which is not cached).
// Firebase Auth persists per origin, not per page: the anonymous user
// auth-boot.js creates on every consumer page was restored on tournament.html
// too, where the sign-in panels hid, "Signed in as <uid>" appeared and the Save
// gate passed. Its onAuthStateChanged now keeps a non-anonymous user or null,
// so an anonymous session sees the page as a signed-out one does; the ownerUid
// rule refuses an anonymous provider on the server. An installed device on
// v145 still hides the sign-in form from an anonymous golfer and lets them
// reach the Save gate - the rule then refuses the write.

// Moved to v145: the Card tab fails closed on a link whose group is not in
// this round.
//
// index.html only. A ?group=N with no boundary - a stale link from a round
// that had more groups, or a typo - used to fall back to the WHOLE FIELD under
// a badge saying "Scorekeeper: Group N Only", and every scoped surface then
// showed everyone. It now resolves to nobody: no card, no hole, no My Round,
// no ticker, no recap, and one line saying the link's group is not in this
// round. The readers that widened an empty scoped list read one helper
// (scopedPlayers) that tells "no lock" from "a lock that matched nobody", and
// the surfaces whose builders widen an empty list themselves (hole-events.js,
// bet-strip.js, money-engine.js - untouched) are not asked. An installed
// device on v144 still shows a stale group link the whole field.

// Moved to v144: Wave A - three small fixes, no figure changes.
//
// pool-engine.js: a tied net place's line now carries {shares: [...]} in ids
// order, the array the engine paid the tie from; settlement.html reads them
// (netTieShares) instead of reproducing the split with the engine's allocators.
// Every figure is unchanged and the Receipt renders character for character
// what it rendered. trip.html: the trip money card's sentence says "the Weekly
// Game" where it said "the Main Pool" (TRIP_TOTAL_INCLUDES). index.html: the
// Finish Round button on hole 18 carries the same mousedown guard Prev/Next
// got in v128 and openFinishRoundModal commits a pending score first, so the
// first tap with a score still focused opens the modal instead of being
// swallowed by the re-render. An installed device on v143 keeps a Finish
// button whose first tap does nothing while a score is pending, a trip card
// still saying Main Pool, and a Receipt that recomputes the split it prints.

// Moved to v143: the Weekly Game is the Weekly Game everywhere it is named.
//
// admin.html (the wizard card's checkbox, the skins note, the two skins-scope
// notes, the validation alert, the grouping and flights sentences) and
// index.html (the Card tab's action banner, the KP setup alert) say "Weekly
// Game" where they said "Main Pool", matching the Receipt since v142. The
// stored key is still moneyPool; nothing but the words moved. An installed
// device on v142 sets up a "Main Pool" and reads a "Weekly Game" receipt.

// Moved to v142: the Results tab's pool reads WEEKLY GAME, pays a tie one golfer
// at a time, and numbers the places.
//
// settlement.html only, presentation only. The section header says Weekly
// Game (the stored key is still moneyPool); the payouts block has no title
// line; a tied net place is one row per golfer with that golfer's own share
// (the engine's allocator, the engine's inputs - summing to the group amount
// and matching the detail below); every net payout row carries its place,
// 1 / 2 / T3 / T3, by the leaderboard's tie rule. A legacy-round tie detail
// now prints the cents the engine paid (33.34/33.33/33.33) instead of "each".
// An installed device on v141 keeps "Main Pool" and the combined tie row.

// Moved to v141: the Results tab's Side Matches cards follow the link's group.
//
// settlement.html's per-match cards now apply the rule every other surface
// uses (grouping.js canLinkSeeWager over each match's participants): a
// ?group=N link sees the matches one of its golfers is in, the bare link
// sees them all, and a group with none is told so. The MONEY is unscoped:
// Final Results, Player Payouts, Who Pays Who, the Main Pool and the
// scorecard are the full record on every link, proved character for
// character. An installed device on v140 keeps a Receipt that lists every
// group's matches to every link.

// Moved to v140: the Board and Stats tabs scope their wager cards to the link.
//
// leaderboard.html's LIVE MATCHES & PRESSES and Stroke Bets cards, and
// stats.html's Side Matches section, now apply the v135 rule (grouping.js
// canLinkSeeWager, over each match's participants): a ?group=N link sees a
// side match only if one of its golfers is in it, so the press link it used
// to offer on another group's match is gone with the card. The bare link,
// the standings, the skins ledger and the flight cards are unchanged. An
// installed device on v139 keeps a Board that shows every group every match.

// Moved to v139: Anonymous Auth at boot, one shared tag on every Consumer page.
//
// auth-boot.js (new, precached) is loaded by the nine Consumer pages directly
// after firebase-app-compat.js. It creates window.authReady at parse time,
// then - after the parse, on a zero-delay timer - loads firebase-auth-compat.js
// asynchronously and signs in anonymously (or restores the persisted user
// with no network). Nothing awaits it yet; no rule and no screen changed. An
// installed device on v138 keeps pages with no anonymous uid.

// Moved to v138: the skins row wording lives once, in live-skins.js.
//
// buildSkinsLedgerRows() is the one builder of the hole-by-hole skins rows -
// which holes are listed, how a carried run reads, what a collecting hole
// says it collected - and settlement.html, index.html and leaderboard.html
// render what it returns. No text moved on a finished round (proved by sha
// against the v137 text on five rounds); a mid-round Receipt preview now says
// an open run is "carried to" the waiting hole, as the Card and board already
// did. An installed device on v137 keeps the three page-local copies.

// Moved to v137: the Card and Board tabs' skins ledgers follow the Receipt.
//
// index.html (the live skins panel and the live KP status) and
// leaderboard.html (the LIVE SKINS board): only the holes that paid are
// rows, "Hole 7" not "H7", a carry round's tied holes in the Receipt's own
// compact wording, waiting rows kept. No number, name or amount moved. An
// installed device on v136 keeps the eighteen-row ledgers.

// Moved to v136: skins rows that list only the holes that paid, and Hole View
// widgets a cart can read.
//
// settlement.html: the Main Pool skins ledger lists the holes with a skin as
// "Hole 7", no longer every hole as "H7" with a "Tie ... No Skin" row for each
// tied hole; on a carry round a run of tied holes is one compact line and the
// hole that collected says what it collected. index.html: the live dashboard
// cards above the score boxes - leaderboard, dots, skins, matches - use
// slightly larger type and darker secondary text; the hole heading still lands
// first after Next. No number, name or amount moved. An installed device on
// v135 keeps the eighteen-row ledger and the small type.

// Moved to v135: Bets and Matches split the jobs, scoped to the group.
//
// skins.html (Bets) now shows a group its OWN action - every match with one of
// its golfers in it, the round games it is in, the round-wide games - with the
// full live display that used to sit on the Matches tab, and its round-config
// controls are read-only on a ?group= link. sidematches.html (Matches) is where
// matches are built: one result line per card from bet-strip.js, the press and
// remove controls, the mini scorecard; its two inline engine copies are gone
// and it loads money-engine.js and bet-strip.js. grouping.js gained the one
// visibility rule both tabs consult. An installed device on v134 keeps the old
// Skins Tracker, an unscoped Matches list and the page-local engine.

// Moved to v134: the Results page is sectioned so it can be read.
//
// settlement.html only, presentation only. The Main Pool card was 62 bare
// ledger rows: now each game (KP, Net Finish, Skins Pot) is a bordered block with
// a real header, each flight inside the Skins Pot is a bordered block with its
// pot in the header, LIVE RESULTS skins cards are dashed and every per-flight
// card carries its flight as a coloured edge, the mounts are separated by a
// rule, and the print button appears once (top of the settled receipt) instead
// of twice. Not one number, name or row moved - the text is pinned by sha. An
// installed device on v133 keeps the undifferentiated stack.

// Moved to v133: an offline Save & Start Round tells the truth.
//
// admin.html. Measured: with no socket the round write is buffered by the SDK,
// lands seconds after the network returns and the page finishes normally - but
// the button sat on "Saving..." with no explanation, the save was tracked by
// nothing, and on native a reload lost the round with no warning. The save
// chain (the round update and the trips put) now goes through GolfNet.track()
// - the pill counts it and the beforeunload guard warns - and after 3 s the
// button says "Still saving - keep this page open." An installed device on
// v132 keeps the silent version.

// Moved to v132: every read on the way to a round, trip or tournament is timed.
//
// v131 raced the code check; the probe then found "Start from a previous
// round" still hung on "Checking..." forever, because its SOURCE read sat
// ahead of the issuer. code-issuer.js now exports the one race (readWithTimeout)
// and admin.html routes the copy's source read, the wizard's arrival load and
// loadModeData through it; trip.html routes the planner's course read. An
// installed device on v131 keeps the dead copy button and a planner that never
// comes back.

// Moved to v131: starting a round with no connection fails visibly.
//
// code-issuer.js (precached, SHARED_SHELL) now races every code-existence read
// against a timer (8 s) and rejects with err.code 'timeout' when the database
// never answers; admin.html, trip.html and tournament.html restore their
// controls and say the round / trip / event was not created and to try again.
// Measured before: a Game Day tap with no signal left the tile on "Starting..."
// forever. An installed device on v130 keeps that hang.

// Moved to v130: the tab bar shows all eight pages.
//
// index, leaderboard, settlement, skins, sidematches, stats. The bar was a
// horizontal scroller of four pills beside a "⋯ More" popover holding the other
// four; at 390px the strip had 255px for 455px of pills with the scrollbar
// hidden, so Bets and Results were off screen with nothing hinting they existed.
// The bar now wraps into two rows of four - emoji plus a short label (Card,
// Board, Bets, Results / Matches, Stats, Trip, Home) - with no More and nothing
// to swipe. An installed device on v129 keeps a scorecard whose Bets and Results
// tabs cannot be seen without a swipe nobody is told about.

// Moved to v129: the hole landing shows the heading and opens no keyboard.
//
// index.html, after a real round on v128. Next, Prev and the 1-18 jump now scroll
// so the hole heading ("Hole 5 · Par 4") sits at the top with the score boxes
// under it, instead of the first box at the top with the heading above the fold;
// and nothing is focused on a hole change, so the keyboard no longer covers the
// page on every Next. Auto-advance while entering scores, the pending-score
// commit and the tap guards from v128 are unchanged. An installed device on v128
// keeps the heading-less landing and the keyboard pop.

// Moved to v128: Hole View lands on the first score box, and Next never misses.
//
// index.html. Next, Prev and the 1-18 jump now scroll so the next hole's first
// score box sits a fixed offset from the top and focus the first empty box, inside
// the tap so iOS opens the keyboard; a completed hole focuses nothing. And a score
// still focused when Next is tapped no longer swallows the tap (the button under
// the finger was being rebuilt by the save before the click landed): the box keeps
// focus through the mousedown and the handler commits it inside the click. An
// installed device on v127 keeps a scorecard whose Next lands wherever the page
// was and, after a lone "1", does nothing at all.

// Moved to v127: the Receipt opens with a PAYOUTS block.
//
// settlement.html's Main Pool section now starts with who is owed what, by game
// in the order cash is handed out - Skins (per flight when the pool split),
// Net Finish, KP - before the pot headers and the hole-by-hole proof. Every
// figure is the engine's; nothing below the block moved. An installed device on
// v126 keeps a settlement.html whose Receipt still opens with eighteen hole rows
// per flight, so the person paying out scrolls past the proof to the answer.

// Moved to v126: the Main Pool's skins bucket splits by flight.
//
// When flights are on and the round's skins scope is per flight, pool-engine.js
// now splits the bucket into a pot per flight by headcount (whole dollars,
// remainder to A) and resolves each pot on its own golfers, like a per-flight
// wager. KP and Net Finish stay whole-field; flights off or scope whole-field
// is byte-identical. live-skins.js keeps the flights on the pool section in
// that case, so every live skins surface shows FLIGHT A / FLIGHT B pots; the
// Receipt (settlement.html) prints the split line and a ledger per pot; the
// wizard's Main Pool note (admin.html) says which case the round is in. An
// installed device on v125 keeps a pool-engine.js that pays one field-wide
// pot under a per-flight scope, a live-skins.js whose pool section is always
// whole-field, a Receipt that disagrees with the new engine, and a wizard
// note that calls the bucket one pot when it is two.

// Moved to v125: reopening a saved round no longer throws in the restore.
//
// admin.html's loadModeData called updatePressRuleExplanation on a Nassau
// <select> deleted in de07a2f (2026-08-27), for every round the wizard had
// saved (the save writes nassauPressRule "2down" on all of them). The throw
// emptied Step 5 on every reopen before v124, and after v124 left the flights
// switch off, both flight scopes at their defaults and the Stableford block
// unrestored - a re-save then wrote flights: null and dropped every tag. The
// helper, its table, its call and the retired editor's guarded restores are
// gone. tools/round-reopen-check.js reopens a wizard-saved round in Chrome.
//
// An installed device on v124 reopens every round with flights off and an
// alert about a null element.

// Moved to v124: one loader on arrival.
//
// admin.html loaded a new round TWICE - once as the page parsed and once from
// the arrival block - and each load ended by wiping the roster and rebuilding
// it, so whichever read resolved last owned it. A copy (Start from a previous
// round) whose own empty read landed last showed the copied-from banner over
// ONE blank row: 23 golfers gone. A fresh code opened Step 5 with two blank
// rows. Now the arrival block is the only loader (an edit loads the round, a
// copy loads the source, a fresh code loads its own empty record and adds the
// one row), the roster is rebuilt last, and a failure inside the restore is
// reported with its message instead of vanishing as an unhandled rejection.
//
// An installed device on v123 can lose the copied roster to the race and
// opens every fresh round with two blank rows.

// Moved to v123: start a new round from a previous one, from the lobby.
//
// admin.html: the prefill admin.html?game=NEW&copyFrom=OLD has always worked
// from a link and nothing on the lobby emitted it since 2026-08-10; trip.html's
// "copy from round" select sent it to a lobby that minted a code and dropped
// it. Now: a "PREVIOUS ROUND CODE - Start from it" field checks the source
// (exists, has golfers), mints the new code, then navigates with both params;
// and the tile (createRoom) carries copyFrom onto the minted URL, so the trip
// select works for the first time. The copy still runs only on a code with no
// players. Nothing is written to the source round.
//
// An installed device on v122 has no way to start next week's round from
// this week's without typing a URL.

// Moved to v122: a re-save keeps what the wizard does not own; the leaderboard
// ranks ties.
//
// admin.html: a Step 7 save on a round in play used to rebuild
// additionalGameInstances from the wizard's skins list only (an Action-tab dots
// game was deleted with its money, a switched-off skins wager came back on),
// re-save a Front-9 round as 18 holes (the round length was never restored),
// and rebuild courseData from the LIVE course card (a since-edited card rewrote
// pars and stroke indexes under posted scores). Now: instances of other formats
// are held and written back untouched, enabled:false stays, the length is
// restored from the round's own holes, and an existing round keeps its own card
// unless the course is deliberately changed. Step 6 says when the round already
// holds a Nassau instead of offering a second one. Removing a golfer who has
// posted scores asks first (scores are never deleted; ids are never re-minted).
// leaderboard.html: positions come from the engine - 1, T2, T2, T4 - on the
// flat board, the flight cards and the group cards, instead of 1, 2, 3, 4 down
// a tie.
//
// An installed device on v121 can delete a dots game by saving the wizard, and
// shows 1-2-3-4 down a tie on the leaderboard.

// Moved to v121: entering a score moves the keyboard to the next golfer.
//
// index.html: auto-advance never survived its own save. Moving focus blurred
// the box, blur fired change, change saved, and the vendored SDK raised the
// round's value event synchronously inside set() - so renderScorecard rebuilt
// the Hole View under the move and focus ended on <body> with the keyboard
// closed, on every score, since the day auto-advance was added. Now the advance
// names its target (player id + hole) before it moves, renderScorecard captures
// what should have focus and re-focuses the rebuilt box synchronously, inside
// the same keystroke. A snapshot from another group mid-entry keeps the golfer's
// box, typed digits and caret. Leaving a box (a tap elsewhere, the last golfer)
// still closes the keyboard. Nothing about the save or the listener changed.
//
// An installed device on v120 loses the keyboard after every score.

// Moved to v120: the live skins surfaces build from the right config.
//
// New shared file live-skins.js, precached. index.html (the SKINS WON card,
// the Finish Round list, the hole-by-hole mount), leaderboard.html (the live
// skins board) and settlement.html (LIVE RESULTS' SKINS WON) used to hand the
// ROUND to the ledger builder: a round whose only skins money is the Main Pool
// bucket printed NET SKINS per flight for a gross, field-wide pot, and a stacked
// or instance wager's own Gross/Net was never read. Now: one section per skins
// wager from that wager's config, plus the pool bucket's own section from the
// pool's scoring and carry, never flighted. The Finish Round list also shows
// every flight (it listed Flight A only). A flightless main-format wager
// renders byte for byte as before (live_skins_golden_test.js). The engines are
// untouched; nothing paid changes.
//
// An installed device on v119 shows a net, per-flight skins ledger for a gross
// pool bucket, and has no live-skins.js to serve offline.

// Moved to v119: the paste drops the blank arrival row.
//
// admin.html: Step 5 opens with a blank player row, and Paste Player List
// captured it as a golfer - it took the first slot of group 1, so 23 pasted
// as 4/4/4/4/4/3 landed as 1/4/4/4/4/4/3, and the save named it "Player 1".
// A row with no name and no handicap is dropped by the paste before sizes
// are counted. A named row with no handicap stays.
//
// An installed device on v118 pastes a list and gets a phantom golfer at the
// top of group 1 with every group shifted by one.

// Moved to v118: the Paste Player List box reads groups and bare handicaps.
//
// admin.html: a blank line between runs of names is a group boundary, and the
// run sizes are written to groupSizeOverrides (a paste with no blank line
// changes nothing about groups - byte-identical to before); a trailing token
// like "9", "+2" or "14.3" after a name is a handicap without a comma, "Matt H"
// stays a name, a line that is only a number is a name. The preview says how
// many groups the paste makes.
//
// An installed device on v117 has to size the groups by hand after a paste and
// loses "Marty 9" as a name with no handicap.

// Moved to v117: flight labels on the receipt's ledger; skins never carry by
// default.
//
// settlement.html: under each golfer on Player Payouts, a skins or birdie
// line from a wager the round scopes per flight reads "Skins (A)" / "Birdie
// Pool (B)". A field-wide wager on a flighted round, and every line on a
// round without flights, prints exactly as before. Totals and Who Pays Who
// carry no badge. Presentation only - the engine's labels are unchanged.
//
// admin.html and index.html: every place that read an absent skins carry
// flag for itself (`!== false`, which is CARRY) now asks skinsCarriesOver(),
// the resolver the money engines pay by (absent is NO CARRY). A fresh "Also
// Playing -> Skins" saved skinsCarryOver: true and painted Carry Over on a
// game nobody had configured; a legacy round with no flag reopened as Carry
// Over and would have re-saved as carry, restating money the engine had
// already paid no-carry.
//
// An installed device on v116 shows "Skins" with no flight beside it, and
// its wizard writes a carrying skins game for a group that never chose one.

// Moved to v116: the leaderboard shows flights.
//
// leaderboard.html: the live skins board reads the per-flight ledger (it drew
// nothing on a flighted round before); a By Flight view - the group cards
// sliced by tag - behind a pill row that replaces the group toggle only when
// the round has flights; an A/B badge on All Players rows. One row builder
// for every table. A round with no flights renders byte for byte as before.
//
// An installed device on v115 shows no skins board on a flighted round.

// Moved to v115: the live surfaces show skins per flight.
//
// bet-strip.js prices and lists skins per flight ("A: Ann 2 / B: Eli 1");
// hole-events.js announces one skin per flight per hole, named; skins.html
// draws one ledger section per flight from the per-flight engine view;
// index.html's live skins widget and hole-by-hole modal and settlement.html's
// LIVE RESULTS and SKINS WON cards read the per-flight ledger, where a hole
// can be a skin in A and a tie in B. index.html lost a birdie-total copy
// nothing called. A round with no flights renders exactly as before.
//
// An installed device on v114 shows one field on every live surface.

// Moved to v114: flights (A/B) - the setup block, the row tag, the engine.
//
// admin.html's Players step gains a Flights (A/B) switch (off by default), a
// live A/B count read through the same capture the save uses, and Skins /
// Birdies scope switches; every row gets a tap-to-flip A/B when it is on.
// The payload writes flights and an explicit flight on every golfer, null
// when off. settlement-engine.js runs skins and birdies per flight through
// flightSlices (action-model.js); a round with no flights key settles and
// renders byte-identically to before (flights_absent_golden_test.js).
// The live surfaces and the leaderboard read flights in later steps.
//
// An installed device on v113 saves a round with no way to tag a flight.

// Moved to v113: admin.html writes skinsRounding on a new round, and a new
// round is a new round again.
//
// The wizard now writes skinsRounding: 'odd-dollar' beside settlementMode at
// creation, guarded the same way on edit. Finding on the way: the guard's
// loadedExistingRound was set for a FRESH code too (the lobby lands on
// ?game=CODE before anything is written), so every wizard-created round since
// v41 had settlementMode deleted from its first save and settled in cents.
// The guard now requires a stored record (snapshot.exists()). No round that
// exists changes; rounds created from here on get both flags.
//
// An installed device on v112 creates rounds with neither flag.

// Moved to v112: skins pay whole dollars on new rounds, and every surface reads
// the engine for them.
//
// settlement-engine.js gained the odd-dollar rule (base = floor(pot / skins),
// the remainder one dollar each in hole order; an odd split buy-in goes
// ceil/floor per golfer), gated per round by skinsRounding: 'odd-dollar' so
// no round already played moves. skins.html now draws the engine's per-skin
// ledger instead of its own copy of the resolvers and pot math; bet-strip.js
// prices its live awards from the engine's pots and allocator; hole-events.js
// prints no dollar on a flagged round's recap card because that dollar is not
// final until the last skin; index.html lost three skins resolvers nothing
// called. admin.html does not write the flag yet (Step 5), so no live round is
// flagged by this build.
//
// An installed device on v111 keeps a skins.html that computes its own money.

// Moved to v111: the comments in tournament.html say what the rules now hold.
//
// database.rules.json gained ownerUid and registrations rules (published from
// the console, not from a deploy). Two sentences on the page said the rules
// did not enforce ownership; from the publish on, they enforce that ownerUid
// is the writer's own uid and can never change, and still do not require a
// tournament to have one. No behaviour moved; the words describing it did.
//
// An installed organizer on v110 reads a comment that lies about the rules.

// Moved to v110: the team cards are back on the Setup tab, and the public
// scoring-link rows carry no editing control.
//
// One row was doing two jobs. The "Team Scorecard Links" block moved to the
// Leaderboard tab in v109 carried the editable Team Handicap input with it,
// so an owner opened Setup and found no teams, and every signed-out visitor
// gained a control the gate exists to withhold. Both shipped. The row is
// built once now - teamRowHtml(t, { editable }) - written editable into the
// Setup cards and read-only into the public links, and
// tournament_setup_inventory_test.js counts what each Setup section renders.
//
// An installed organizer on v109 has a Setup tab with no team cards.

// Moved to v109: organizers sign in to manage a tournament.
//
// tournament.html gates its Setup & Links tab: an owned tournament renders it
// only for the signed-in user whose uid is its ownerUid, a legacy tournament
// (no ownerUid) exactly as before. saveTournament requires a signed-in
// organizer and writes ownerUid in the same set. Printing and every scoring
// link moved onto the Leaderboard tab so they stay open to everyone. A
// GUARDRAIL, NOT A BOUNDARY: the rules did not change, and anyone holding
// the code can still write what the tab edits; the page and HANDOFF say so.
// tournament-scorecard.html is untouched - a golfer never sees a sign-in.
//
// An installed organizer on v108 has a console with no sign-in and a Setup
// tab open to whoever holds the code.

// Moved to v108: firebase-auth-compat.js joins the shell.
//
// The auth wave lands its vendored SDK first and alone, so a red says which
// half broke - the eleven lists a third vendored file has to join, or the
// rules that come later. firebase-auth-compat.js 9.22.2 (132195 bytes) is
// precached and loaded by tournament.html after app-compat. Nothing calls
// firebase.auth() yet; tournament-scorecard.html does not load it and never
// will - a golfer on a tee box does not download a sign-in SDK.
//
// An installed device on v107 has a shell with no auth SDK; when the console
// starts using it, that device's first offline launch of tournament.html
// would throw. Bumped now so the file is on every device before that.

// Moved to v107: the service worker leaves /api alone.
//
// The fetch handler exempted only non-GET and cross-origin requests, so a
// same-origin GET to the course proxy was intercepted like a shell file and
// every response - a 503 refusal included - was written into this cache; the
// Cache API does not honour the Function's no-store. Offline, the worker then
// served that stale refusal back, or answered a JSON fetch with the HTML
// "No connection" shell. Measured in the /functions recon of 2026-09-11 and
// pinned red-first by sw_api_bypass_test.js. /api/* is now exempt by
// pathname in the same early return as the cross-origin rule: respondWith is
// never called, the browser's own fetch handles it, a refusal is never a
// document, and an offline call rejects into admin.html's own catch.
//
// An installed device on v106 keeps a worker that caches refusals and holds
// every /api answer it has ever seen until the next bump.

// Moved to v106: the picker tells a golfer when an online search was cut
// at 25.
//
// Six live requests on 2026-09-12 proved /v1/search returns at most 25
// courses, in the same order whatever paging parameter is sent, with no
// total_records and nothing beside `courses` (48d2077). A golfer whose
// course was the 26th match saw 25 others and nothing else - no signal, no
// way forward. At 25 or more the dropdown now says only the first 25 are
// shown and to narrow the search, without claiming how many matched
// (the API never says), and offers the add row below that notice with a
// narrower-search caveat. Below 25 nothing changes. course_import_test.js
// holds it at 24, 25 and 26.
//
// An installed device on v105 keeps a picker that cuts the list in silence.

// Moved to v105: admin.html's picker no longer prints "undefined" for a
// course record with no location.city.
//
// A real provider record - Gore Golf Club, kjr804p4, measured live on
// 2026-09-12 - carries state "Unknown", country "Unknown" and no city at all.
// The result row already showed that as "?", but the confirm panel's match
// note and the confirm button interpolated L.city raw, so the button that
// writes to a node nobody can delete read "Use Gore Golf Club — undefined,
// Unknown". Both strings now use the row's own (L.city || '?') idiom;
// course_import_test.js holds all three against a fixture shaped like that
// record.
//
// An installed device on v104 keeps the picker that prints "undefined".

// Moved to v104: tournament.html prints a pairings sheet.
//
// The sheet a starter holds at 6am: every team or group as a row, every golfer
// on their own line, sorted by starting hole on a shotgun with a blank hole
// FIRST and HOLE NOT SET in the row, the count of missing holes at the top, a
// withdrawn golfer printed and flagged WD and left OUT of the golfer total,
// and in individual mode an UNASSIGNED block for anyone in no group. One
// trigger, printSheet(build), now serves both this and the results sheet.
// tournament_pairings_print_test.js holds the multiset of printed names
// against the record; tools/tournament-pairings-check.js proves the print CSS
// on this sheet in Chrome.
//
// An installed organizer on v103 has a Tournament page with no Print
// Pairings button.

// Moved to v103: the guide states the Skins default the code declares, and
// says how a card gets into the picker.
//
// instructions.html said "ties carry the pot to the next hole". Since v96 a
// new round does not carry unless somebody says so - SKINS_CARRY_DEFAULT is
// false - so a golfer who read the guide and touched nothing got the opposite
// rule. It now quotes admin.html's own default explanation and names the
// switch, and instructions_accuracy_test.js holds that sentence against
// action-model.js so it cannot go stale silently again. An empty bordered
// info-card that had sat under Birdie Game since August is gone. The course
// section, one clause since the rewrite, now says the three things that are
// true on every platform: an added or imported course is shared with every
// future round, a second import replaces the stored card and nothing can
// delete it, and the picker matches the name on the sign.
//
// An installed device on v102 serves a guide that states the wrong Skins rule.

// Moved to v102: the Android hardware back button closes what is on top.
//
// Capacitor 8 core has no back-press code; @capacitor/app fires 'backButton'
// and otherwise does nothing. pwa-boot.js now owns the press as window.GolfBack,
// one precedence order on every page that loads it: a sub-state inside a modal
// goes back first (Finish Round detail/results -> review, New Action owner ->
// scope), then the top modal overlay closes, then the ⋯ More popover, then the
// setup wizard steps back (never on its first step, never from Round Ready), and
// with nothing open the WebView goes back through history or the app minimises.
// The delete confirm on Matches closes through its own function so the pending
// id is cleared. Armed only when Capacitor.Plugins.App exists - the web build's
// behaviour is unchanged. index, admin and sidematches load pwa-boot.js without
// `defer` now, because they register their probes from their own script.
//
// An installed device without this bump keeps a pwa-boot.js with no GolfBack,
// and a page script that registers into nothing.

// Moved to v101: the Android shell hands out links to the web app, and the trip
// recap's Share button is never a silent no-op.
//
// Capacitor on Android serves the page from https://localhost. shareBaseUrl()
// judged "can another phone reach this?" from the origin alone, and an https
// origin with a host passes - so every invite, QR, group scorekeeper, organizer,
// follow and trip link built on Android read https://localhost/... and opened
// nothing on the phone that received it. product-links.js now asks Capacitor
// first: a native shell shares the canonical origin whatever it is served from.
// A developer's web page on https://localhost, with no Capacitor object, still
// shares itself.
//
// trip.html's shareRecap swallowed a share sheet that rejected. With no share
// sheet at all it already went to the clipboard; now a share sheet that FAILS
// for any reason other than the golfer closing it (AbortError) does too.
//
// An installed device without this bump keeps building https://localhost links
// inside the Android shell.

// Moved to v100: a Nassau states its real price on both pages, and the Receipt
// drops a nine-argument call to the money engine that nothing read.
//
// THE LABEL. A Step-6 Nassau keeps its price in frontStake/backStake/overallStake
// and leaves the legacy `stake` at 0, so the Matches tab - which printed
// `$${sm.stake || 0}/match` - read "$0/match" for a bet worth $25. EIGHT ROUNDS
// IN THE LIVE DATABASE ARE SHAPED EXACTLY THAT WAY. Hole View had the mirror
// bug: its inline builder coerced a blank segment to zero, so a legacy
// single-stake Nassau read "F $0 / B $0 / O $0" for a $20 bet. Both pages now
// call nassauStakeLabel() in action-model.js, which applies money-engine.js's own
// fallback - a blank segment is charged at the legacy stake - and names the
// auto-press amount, which neither page showed before. No money moves: the
// function formats stakes that are already stored.
//
// An installed device without this bump keeps telling a foursome their Nassau is
// worth $0.
//
// settlement.html's buildSideMatchesHtml computed calculateMatchEngine(...) with
// nine arguments - no stakeConfig - assigned it to `calc`, and used it for one
// thing: `if (!calc) return;`. The row was always built by buildReceiptBlock(),
// which recomputes from buildSideMatchReceipts(). `formatLabel` was assigned and
// never referenced.
//
// NO FIGURE ON SCREEN MOVES, and that was measured rather than assumed: six
// fixtures across three surfaces - split-stake Nassau, priced auto-press, a
// side-match Nassau, a single-stake Nassau, a Match Play side match, and the
// two-players-on-one-team case that is the ONLY input making that call return
// null - produced byte-identical money before and after, 18 of 18 pairs.
//
// An installed device without this bump keeps serving a Receipt whose source
// reads as though a nine-argument engine call is where its numbers come from.
// That is the hazard being removed: the next person pricing a Nassau segment
// there would wire it to the wrong number.

// Moved to v99: the course picker can import a card from the provider, and four
// courses called "Legacy Golf Club" no longer become one record.
//
// THE KEY IS THE POINT. The ordinary save path mints an unmapped course as
// "comm_" + name.replace(/[^a-z0-9]/g,''). The provider returns FOUR Legacy Golf
// Clubs - Leitchfield KY, Henderson NV, Ottawa Lake MI, Norwalk IA - and all four
// slug to comm_legacygolfclub. Import two and the second overwrites the first,
// card and all, under a key ".write": "newData.exists()" means NO CLIENT CAN EVER
// DELETE. An imported course is now keyed on the provider id instead.
//
// The online search is a ROW the golfer taps - never the input event, which fires
// on every keystroke and would spend half a day's lookups on one course name.
// Nothing auto-selects, even on a single result. The 36 numbers land in the
// existing grid, validated by validateCourseGrid, before anything is written, and
// the confirm button names the course AND the city because the name alone cannot
// separate four of them.
//
// A refusal never says "no courses found" - every unavailable reason gets its own
// sentence, because "we could not ask" is not "it is not there", and that
// confusion is what had the picker offering to add a duplicate of a course that
// existed.
//
// An installed device on v98 has a picker that cannot import at all.
//
// Moved to v98: the course picker finds the name on the sign. admin.html
// filtered with item.name.toLowerCase().includes(lowerFilter) - a substring test
// on the whole typed string - so every word a golfer added could only narrow.
// The directory's "Camas Meadows Golf Club" was unfindable to anyone who typed
// "Camas Meadows Golf Course". Measured over all 141 entries: 59 end in one of
// Golf Club / Golf Course / Country Club / Golf Links / Golf Resort, and 249 of
// 295 realistic confusions returned nothing; 123 of 141 were findable by their
// distinctive words and LOST the moment a suffix was added.
//
// Worse than empty: the dropdown then offered 'Add "..." as a new course', so a
// golfer created a duplicate of a course the app already had - under a
// global_courses key ".write": "newData.exists()" means no client can delete.
//
// Now one courseNameMatches(), used by BOTH the directory filter and the
// community-courses filter, matching on substring OR suffix-stripped tokens.
// Measured: sign-name failures 1185 -> 0, mid-token regressions 0, mean results
// per query 4.05 -> 4.05, and not one query returns more than before.
//
// An installed device on v97 keeps the picker that cannot find the course a
// golfer is standing on.
//
// Moved to v97: publishing a course card no longer deletes the rest of the
// course record. admin.html published the edited card with
// db.ref(`global_courses/${courseKey}`).set({name, data}) - and .set() REPLACES
// THE WHOLE NODE. Harmless while a record held only name and data; a silent
// deletion the moment one holds anything else. Measured cold: a record seeded
// with ["data","location","name","source","tees"] came back ["data","name"]
// after one ordinary save. It is now .update(), which merges.
//
// THIS BLOCKS THE COURSE IMPORT, which is why it ships alone and first. Every
// field that import would add - tee sets with their own ratings and slopes, the
// street address, the provider id - had a golfer-triggered deletion path with no
// warning. And global_courses/$courseId carries ".write": "newData.exists()", so
// no client can restore what the overwrite removed: recovery meant importing the
// course again.
//
// An installed device without this bump keeps serving the admin.html that
// overwrites. One golfer on a stale shell is enough to wipe an imported course
// for everybody.
//
// Moved to v96, PART TWO: a team score goes into the round it was played in, and
// only when that round is open. tournament-scorecard.html has three functions
// that write a score and only saveIndividualScore asked either question. Measured
// on both team formats: a SETUP round accepted a team score and wrote it with
// every box live, so did a CLOSED one; Day 1 and Day 2 of the same event both
// wrote tournaments/<code>/scores/team1_h1, the second day overwriting the first
// as it was played; and renderAll read the EVENT ROOT, so 18 scores stored under
// the round rendered 0 of 18 filled boxes. The read moved WITH the write - moving
// the write alone would have blanked the card on save. An installed device
// without this bump keeps serving a card that silently discards scores into a
// round nobody is counting.
//
// ONE BUMP COVERS BOTH WAVES, and that is deliberate rather than an oversight.
// v96 has never been published - main is on v95 - so no device has ever held a
// v96 shell, and a second bump would be inventing a version nobody could be
// upgrading from. Both changes ship to a v95 device as one update. Note that the
// version SLUG names the first wave only; the two Moved-to entries under v96 are
// the record of what is in it.
//
// Moved to v96, PART ONE: the team links say what they do. tournament.html told a head pro,
// beside the links, "They can only enter their own team's scores." Measured:
// ?team=1 and ?team=7 each open 18 of 18 editable inputs, so the team number is a
// URL parameter nothing checks, and tournaments/$tourneyCode is ".write": true.
// The sentence is read by the person deciding how carefully to send the links, so
// it made an organizer careless. An installed device without this bump keeps
// serving the promise.
// Moved to v95: one round, one carry rule, every surface. A round storing no
// skinsCarryOver was answered two ways with money attached. The Skins page, the
// live bet strip and the Settle header all read `!== false` - CARRY - and the
// Skins page COMPUTED that way, while the engines read skinsCarriesOver() - NO
// carry. Measured: the Skins page showed Cal $7.22 coming while the Receipt said
// he owed $10, and the Settle page printed "(Carry Over)" over a no-carry ledger.
// All four now route through the one resolver. An installed device without this
// bump keeps serving the version where two screens quote a golfer different money
// for the same round.
// Moved to v94: skins do not carry unless somebody says so. A new round is now
// born No Carry. The settings a round was created with said CARRY in eight places
// across three files, while skinsCarriesOver() - which is what settlement actually
// asks - has always said an absent value does NOT carry. The round's own settings
// and the engine that paid it pointed opposite ways. No historical money changes:
// settlement never read the creation default.
// Moved to v93: the guide describes the app that exists. instructions.html told
// golfers to tap "Start New Game", "Join Game" and a "Copy Invite Link" button -
// none of which exist - described a QR Consumer removed, called codes
// 4-character when they are 6, and said the Settle page counts "main format and
// side games" on a page that pays Side Matches. It had no section on Road Trip at
// all. An installed device without this bump keeps serving a how-to for a
// different app.
// Moved to v92: one sentence says what the trip money is, and every surface that
// shows the money renders THAT one. The panel's header said the total was "every
// linked round's main-format bet" while the total contains side matches, presses,
// the Birdie Pool, KPs and the Main Pool - a group reading it settles their side
// matches a second time on top of a total that already holds them. The recap card
// and the pasted share text, which are what people actually settle from, said
// nothing at all. An installed device without this bump keeps serving the version
// that invites paying twice.
// Moved to v91: a trip code is no longer a master key. Anyone holding the six
// characters could remove rounds, change what counts toward the money total, and
// add rounds to somebody else's trip - and the recap card prints that code on the
// image people screenshot. An installed device without this bump keeps serving the
// version where the link you send the group is the same link that can dismantle
// the week.
// Moved to v90: playing less is not how you win the trip. The cumulative
// leaderboard was a raw stroke sum, so a golfer who played one round of four
// ranked FIRST - on the screen, on the recap card that gets screenshotted, and
// in the text people paste into a group chat. An installed device without this
// bump keeps serving the version that crowns whoever turned up least, and keeps
// publishing it.
// Moved to v89: the trip page tells you when a write fails. Four writes on
// trip.html failed in silence - the counts-toward-trip toggle, the round remove,
// and both halves of link-round. An installed device without this bump keeps
// serving the version where excluding a rained-out day can be refused, the row
// still reads "Counts toward trip", nothing is said, and the week is settled
// from a total that still contains the round the organizer took out.
// Moved to v88: a control that is issuing a code says so, and cannot be pressed twice.
//
// v87 gave the Game Day tile and trip.html's "Skip planning" link a database round
// trip - the existence check that stops two organizers being handed one code. Issuing
// a code used to be free, so both used to act instantly and neither had any pending
// state. Measured cold on v87: two taps issued TWO codes on BOTH surfaces, the second
// navigated, and the first code was abandoned with its round never created.
//
// Both now match the shape trip.html's Build Trip button already used - an hourglass,
// a present participle, and the control made non-interactive - and both restore it if
// the issue is refused, so a failure cannot leave a dead control. Both also re-check
// in the handler, because pointer-events stops a thumb but not an invocation, and
// `disabled` means nothing on a <span>.
//
// An installed PWA on v87 shows a tile that looks identical while it waits.

// Moved to v87: one code generator, with an existence check beside it.
//
// admin.html, trip.html and tournament.html each carried a byte-identical
// six-character generator and not one of them asked whether the code was already
// in use. The odds are remote - 32^6 is 1,073,741,824, about one in a million at
// a thousand live codes - but the damage is not: a round save is an update(), a
// MERGE, and its payload replaces players and courseData while NOT containing
// scores. A second organizer landing on a live code empties the first group's
// card mid-round and leaves their scores orphaned against a roster that no longer
// exists. Trips are worse: the batch builder writes rounds as merge keys, so a
// colliding trip code puts two unrelated groups into one trip, and trip
// settlement nets money across every round in a trip. The deployed rules do not
// catch any of it - a collision is not a delete.
//
// code-issuer.js is now precached and in SHARED_SHELL, the three inline
// generators are gone, and codes come from crypto.getRandomValues with rejection
// sampling rather than Math.random with a modulo.
//
// An installed PWA on v86 can hand two organizers the same code.

// Moved to v86: the audit log and the scorecard can no longer disagree.
//
// undoAuditEntry wrote its log entry on the NEXT LINE after the restore, never
// inside a .then - so the entry describing the undo was written in parallel with
// the write it claims to describe. A log written that way cannot be correct by
// construction; it was correct only because the write usually worked. Refuse the
// restore and the card kept the old value while the log said it had been undone,
// and the log is what a group uses to settle an argument. The entry is now
// written only from .then, so a refused restore logs nothing, and the failure is
// shown on the row in the History modal rather than on the save-state line the
// modal covers.
//
// saveScore watched the score write and not the auditLog write beside it, so a
// refused log left a score changed with no record of who changed it, no Undo row
// for it, and a save-state line truthfully reporting "Saved" about the half that
// landed. Both promises are observed now. clearScoresVerified is handed to
// GolfNet.track so the verification badge reappearing after a refusal is at
// least counted.
//
// An installed PWA on v85 can show a group an audit trail that disagrees with
// their own scorecard.

// Moved to v85: only the organizer link can delete a round, and the control says
// what it destroys.
//
// index.html:1357 carried "🏁 End Current Game / Finished playing? / End & Wipe
// Round" in STATIC markup at the bottom of the scorecard - on every group link,
// because every group link is that page. Measured cold: a client on
// ?game=CODE&group=1 found the button, was asked to confirm, and issued a real
// delete of the round. A four-ball was four people who could each destroy it, and
// the copy invited a partner at the turn to read it as "finish MY card".
//
// The control now renders only for isOrganizerView(), into an empty mount, so a
// ?group= link has no button in the DOM at all - display:none would not do,
// because a hidden button is still clickable from a console. The copy says
// "Delete round for everyone" and the confirm names the round and the golfer
// count. database.rules.json refuses a one-write delete of a round that has
// scores, as the backstop.
//
// An installed PWA on v84 hands every playing partner a working delete button.

// Moved to v84: the pill states a COUNT and never advises, and a refused course
// publish says so on Round Ready.
//
// v83's pill read "N changes could not be saved. Re-enter and try again." That was
// true while scores were the only tracked write. admin.html now tracks the course
// publish too, and there is nothing to re-enter when the shared course list refuses
// a card - the round is fine and the golfer's own scorecard is untouched. It stays
// true when events/<code> anti-destruction lands and a refused round DELETE joins
// the list: nothing was "saved" and nothing was lost, the round is still sitting
// there. So the pill says "N changes did not go through." and beforeunload says
// "Some changes did not go through.", and neither gives advice - the surface that
// knows WHAT failed gives the advice instead.
//
// An installed PWA on v83 tells an organizer to re-enter a course card that cannot
// be re-entered, and shows nothing at all when a publish is refused.
// pwa-boot.js's track() was `promise.then(settle, settle)` - one handler for both
// outcomes - so a rejected write decremented the pending counter identically to a
// successful one and the pill then HID, which in that design is the affirmative claim
// that everything is saved. GolfNet now carries a `failed` count, the pill has a red
// state that clears only when a later write actually lands, and beforeunload warns on
// a refusal instead of staying silent because pending was 0. index.html gains the
// save-state line ported from tournament-scorecard.html, and the Dots write gains the
// .catch the other money writes already had.
//
// An installed PWA on v82 keeps a scorecard that loses a refused score in silence and
// tells the golfer everything is saved. pwa-boot.js is in SHARED_SHELL, so without
// this bump the devices most likely to have the app installed are the only ones that
// never get the fix.
//   THREE FAULTS OFF ONE LIVE ROUND, Y5VGXM - eight golfers, a $40 buy-in pool, and
// every name a placeholder.
//   THE WIZARD SAID NOTHING. admin.html saves a blank name box as `Player N`, and no
// gate ever mentioned it. Inside one round those names are distinct and the money is
// correct, so duplicatePlayerNames() rightly does not refuse them - but
// isPlaceholderPlayerName() makes every one of them unmatchable across rounds, so the
// round can never join a trip or a Ryder Cup. That decision was being made silently at
// the moment of the save. It now WARNS AND YIELDS: the count, the consequence, and OK
// still starts the round. It is the last thing before the write, so nobody confirms a
// round that is about to be refused anyway.
//   TWO GOLFERS THE CARD COULD NOT TELL APART. The Full Card header showed
// name.split(" ")[0], which deleted the only character distinguishing "Player 1" from
// "Player 4" - eight columns all reading "Player" over a record holding eight distinct
// names. First names are still the default; shortening now STOPS where two golfers in
// the rendered set would collide, and both keep their full name. Hole View re-reads
// those same cells, so it inherits the fix rather than needing its own.
//   AND THE LEADERBOARD PRINTED THE GROSS AS A HANDICAP. renderLiveBoard interpolated
// r.hcp raw, so a stored "" gave the bare label "HCP " and the score in the next span
// landed where the number belongs: "Player 1 HCP 90 Net 90". It goes through
// formatHcpDisplay now, the same formatter the card header and Hole View already use,
// so a scratch golfer reads "HCP 0" and a plus-2 reads "HCP +2" on every surface.
// An installed PWA on v81 starts unnamed money rounds in silence and shows a column of
// golfers who all read "Player".
// Moved to v156: tournament registration Wave 1 merged onto main after v155
// (rounds-played). Public signup (?register=CODE) and the organizer Registration
// list (cash/offline Paid, approve into the field). Higher than both branch
// keys so installed devices on v153 or v155 drop the old shell.
// Moved to v157: tournament registration Wave 2a - the field schema. The
// public signup (tournament.html?register=CODE) now asks full name, email and
// phone (required by database.rules.json, published by hand 2026-09-16), GHIN
// or handicap, shirt size, dinner guests, team preference; hole sponsorship is
// in the markup, hidden until 2b's toggle. The desk lists the new fields and
// approve carries fullName. A device on v156 keeps the Wave 1 form, whose
// { name } write the live rules now REFUSE - so the bump is what stops a
// cached page from offering a signup that cannot land.
// Moved to v158: tournament registration Wave 2b - silence is the failure.
// tournament.html: an offline tap says so and writes nothing; a refused
// signup is a sentence in the status line, not an SDK alert; the write races a
// 10-second timer with one entry id per form fill, so "Still sending" never
// becomes two entries and a late acknowledgement flips to confirmed. The
// organizer's "Ask golfers for" switches decide which optional boxes the
// form shows. A device on v157 keeps the form that could go silent.
// Moved to v159: the scorecard link authorises nothing, and the page says so.
// tournament.html: the links headings drop the padlock and say "Anyone who
// has a link can score that card"; Setup gains "Correct a scorecard" behind
// the owner's sign-in, writing the same score path the team's link writes.
// tournament-scorecard.html: "Anyone with this link can score this card."
// tournament-engine.js: the score-path builders both pages agree on. A device
// on v158 keeps the padlocked headings that claim a protection the links do
// not have.
// Moved to v160: the tournament landing gets its hero band. tournament.html:
// a parent-brand mark + Tournaments band over local imagery (assets/tournament-hero.svg,
// NOT precached - the band paints its own dark ground without it), the
// organizer sign-in as a compact card below it, the format picker as four
// weighted cards, the name / course / entry-fee fields restyled. Presentation
// only: same ids, same handlers, same save. A device on v159 keeps the
// trophy-and-title header and the emoji-on-white picker.
// Moved to v161: the receipt's one button is "📤 Send", a small pill at the
// right end of the title row (beneath the title on a phone), and the native
// shell no longer hides it. settlement.html only: same printReceipt(), same export roots, still
// absent while the round is live. A device on v160 keeps the full-width
// "Print / Save Receipt" above the results, hidden in the native app.
// Moved to v162: an imported course shows up in the picker. admin.html's
// community list names gca_ keys (online imports) as well as comm_ keys, so a
// course imported on Monday is offered on Wednesday instead of "No local
// match" and a second, paid-for import. A device on v161 keeps a picker that
// cannot see Legacy Golf Resort.
// Moved to v163: the scorecard rows live once. scorecard-rows.js joins the
// shell - settlement.html's Full Scorecard draws its HOLE / PAR / HCP and
// per-golfer rows from it (byte for byte what it drew before), and the
// leaderboard's tap-a-name card is about to. A device on v162 has a
// settlement.html that calls a file its cache does not hold.
// Moved to v164: tap a name on the leaderboard, see their card. leaderboard.html
// loads score-marks.js and scorecard-rows.js and opens a golfer's scorecard
// beneath their row - two stacked nines, net on the Receipt's terms - on a
// tap of the name; settlement.html asks the shared netMattersOn. A device on
// v164's predecessor keeps a board whose names do nothing when tapped.
// Moved to v165: trip identity - the trip page shows every golfer with how
// many rounds they are in, asks "Same golfer?" when two spellings collide,
// and keys every total by the organizer's answer. trip.html only; a trip with
// no answer renders exactly as before. A device on v164 keeps a trip page
// that merges two Mikes without a word.
// Moved to v166: the beta notice is gone. index.html no longer carries the
// beta end date or the yellow "we're still polishing" bar that appeared,
// permanently, once that date passed - the app is released (App Store 1.0.1,
// 2026-09-15) and the sentence was no longer true. A device on v165 keeps a
// scorecard that calls itself a beta on every open. (beta_notice_gone_test.js
// scans every shipped file for the old names, this comment included.)
// Moved to v167: the Desk tab reaches installed devices. tournament.html is in
// THIS worker's shell list (SHELL_FILES below), so the 2c wave (ec28098, the
// registration desk as its own tab) needed this key to move as well as
// build-shell.js's product key - it moved only the product key. A device
// holding v166 kept serving the pre-2c tournament.html, with the signups on
// top of Starting Holes and no Desk tab, until this.
// Moved to v168: online course search on tournament.html (Option B). The
// shell gains course-import-rules.js - the pure import rules lifted out of
// admin.html so both pages agree on what a valid card is - and admin.html
// now calls it instead of declaring its own. tournament.html is in this
// worker's shell list, so this key moves with build-shell.js's product key.
// A device on v167 has an admin.html whose import rules its cache does not
// hold, and a tournament setup screen that still fabricates a par-4 card.
// Moved to v169: dark mode is gone from the Tournament product. tournament.html
// and tournament-scorecard.html (both in this shell list) lose the toggle, the
// handler, the load-time read of golfapp-theme and the dark palette; the
// Consumer pages and their key are untouched. A device on v168 keeps
// tournament pages that go dark on the round app's setting.
// Moved to v170: the tournament landing hero lockup. tournament.html:
// logo-mark.png (parent brand) with a quiet label under the mark and
// Tournaments on the right, over brand-green fairway art
// (assets/tournament-hero.svg, still not precached). Presentation only. A
// device on v169-tournament-light keeps the uppercase text wordmark and the
// placeholder sunset SVG.
// Moved to v171: the tournaments rules are narrowed. Both tournament pages
// (in this shell list) move with them - the scorecard's refusal sentence and
// the no-owner line on the console. A device on v170 keeps a scorecard that
// blames the signal for a permission refusal.
// Moved to v172: QR codes for team scorecard links. qrcode.min.js joins the
// shell (the Tournament QR library, vendored - it was a runtime CDN script) and
// tournament.html gains the guard, the inline codes and the tee sheet. A
// device on v171 keeps a page that reaches for cdnjs and a modal that never
// opens without it.
// Moved to v173: the tee sheet's QR is a canvas tournament.html paints itself
// and appends before printing. A device on v172 keeps a tee sheet that prints
// blank QR cells - the library's async <img> was still empty at window.print().
// Moved to v174: the Tournament polish wave - tournament.html gains the event
// details block and header lines, the payout filter at zero, and the desk
// state badges. A device on v173 keeps a header with no date and a desk with
// no badges.
// Moved to v175: tournament.html's manage gate hides the gated tabs instead of
// removing them, so a spectator's leaderboard keeps moving after its first
// paint. A device on v174 keeps a board frozen at page load for everyone but
// the organizer.
// Moved to v176: admin.html names the course proxy by its canonical origin in
// the native shell (courseApiBase) - '' on the web, so the web path is
// unchanged. A device on v175 keeps an admin.html whose fetches would resolve
// against capacitor://localhost once the search guards come off.
// Moved to v177: online course search runs in the native shell - the row, the
// two proxy fetches, the import's global_courses write, and gca_ reference
// cards in the picker. A device on v176 keeps an admin.html whose Search
// online row never renders on the phone.
// Moved to v178: the wizard's delete control tells the truth - it checks the
// scores it holds before asking, says the scorecard's sentence on a scored
// round, and sends no write. A device on v177 keeps an admin.html whose
// "End & wipe … for a fresh start" confirms and then shows an SDK error.
// Moved to v179: the course import names the club ("Streamsong Resort (Red)"),
// prints a real em dash on its confirm button, and no longer shows "COURSE NOT
// MAPPED" under an imported card; tournament.html composes the same way. A
// device on v178 keeps a page that stores "Red" and prints an escape.
// Moved to v180: the Weekly Game's KP entry ("Set KP Leader") sits directly
// under the Prev/Next row on every KP hole, whether or not My Round is open, and
// its head reads "Weekly Game KP". A device on v179 keeps an index.html where
// the block is at the bottom of the Weekly Game panel, behind the My Round tap.
// Moved to v181: the KP picker reads at the score boxes' size - the select and
// the ft/in boxes at 17px, 48px tall, one border and one set of corners; the UA's
// 13px select is gone, and the line naming the current leader is 0.95rem. A
// device on v180 keeps the small picker.
// Moved to v182: recording a KP pays it. pool-engine.js no longer waits for an
// organizer confirmation; a blank KP hole is withheld while the round is live
// and refunds to the field once every card is in; settlement-engine.js gained
// computeRoundFinish; index.html lost the confirm ceremony and the KP RECORDED
// alert; settlement.html and trip.html lost their "not confirmed" copy. A device
// on v181 keeps an engine that withholds every recorded KP forever.
// Moved to v183: one link, one code, then the golfer picks their group. A bare
// round link (or a typed code) on a round with more than one group asks which
// group you are keeping score for instead of landing you as a spectator; the
// lobby reads the round before it navigates and refuses a bad code inline;
// Round Ready offers the round's own link first. A device on v182 keeps an
// index.html that never asks and an admin.html that navigates into a blank card.
// Moved to v184: a line that says where the trial stands. admin.html reads
// organizers/<uid> once after authReady (organizer-gate.js readStanding) and
// says "Founder pass · setting up rounds is free" or "Free trial · N days left
// to set up new rounds" on Round Ready and the Review step - the first warning
// before the wall, and the tell for a pass orphaned by a reinstall. A device on
// v183 keeps the wall as the only sentence.
// Moved to v185: the copy messages say what they did. The whole-round link's
// Copy no longer alerts "Copied Group 0's scorekeeper link"; a group's copy
// names its golfers; the organizer link's copy carries its caution; and the
// whole-round row lost the class the share-coverage tool counts. A device on
// v184 keeps the Group 0 sentence.
// Moved to v186 because the Stats tab became the Game tab: an installed device
// would keep the old bar and a stale nav on every page, and would 404 game.html
// offline. Also the Finish Round panel's leaderboard link, dead since the pill
// was renamed Board.
// Moved to v187 because a flighted Weekly Game's skins bucket can now split
// EVENLY between A and B (admin.html's Skins pot switch, pool-engine.js
// skinsSplitMode, the Receipt's and the Game tab's split line). A device on
// v186 would keep a wizard with no switch, an engine that only knows headcount
// and a Receipt that says "by headcount" on a round paid evenly.
// Moved to v188 because admin.html's Paste Player List reads a leading flight
// letter ("A · Randy T 12") and turns flights on for the round. A device on
// v187 would paste that list as 25 golfers named "A · Randy T".
// Moved to v189 because the round setup got its doors: "Edit round setup" on the
// scorecard and the Game tab for the organizer (index.html, game.html now load
// organizer-gate.js), and admin.html refuses the wizard on an existing round to
// anyone else. A device on v188 would keep a scorecard whose Group Links panel
// hands the organizer link to every spectator on the bare link.
// Moved to v190 because the Game tab draws golfer names with the Board's own
// formatter (getSmartDisplayName, lifted from leaderboard.html into
// text-safe.js): Randy T / Randy C read "Randy T." / "Randy C." instead of two
// Randys. game.html, leaderboard.html and text-safe.js are all precached.
// Moved to v191 because a replaced round now says so: admin.html offers to
// retire the unfinished round a new one supersedes (events/OLD/supersededBy),
// and index.html shows that round's visitors a banner to the live code and
// takes no score. A device on v190 would keep scoring a retired round.
// Moved to v192 because a blank hole inside a card now shows: score-gaps.js
// (new, precached) feeds the scorecard's outlined box and banner, the Board's
// "missing N" flag and the money pages' "Not final" line. A device on v191
// keeps a Board that quietly sums what is there.
// Moved to v193 because the KP block on a par 3 is now the question - "Did
// anyone in your group get inside it? No — leave it / Yes — pick who" - lit
// once the group's scores are in, asked once per hole per phone. A device on
// v192 keeps the button nobody understood.
// Moved to v194 because the Full Card's cursor now walks a golfer's card
// (the same golfer's next hole, then the next golfer), the scorecard's own
// name labels use the Board's formatter, a Weekly Game round no longer says
// "no bets", the wizard's pot shows on an edit, and the roster paste drops a
// trailing period. index.html and admin.html are precached.
// Moved to v195 because the organizer has a Players sheet on the scorecard and
// the Game tab (rename, handicap, flight, Out, add a golfer to a group) and an
// Out golfer is greyed on the card, the Board and the Receipt (scorecard-rows.js).
// Moved to v195b (v196 in the cache name) because the Results page and the printed
// Receipt drop the per-golfer NET list on a Weekly Game round and every section
// head is a clear size above its rows. settlement.html is precached.
// Moved to v197 because KP money never goes back to the field: a blank KP on a
// finished round is held in the pot ("Not final — KP on hole 15 not recorded"
// on the live head, the Weekly Game card, the Receipt head and Finish Round),
// "nobody" goes to the skins pot, an Out leader is held until re-recorded.
// pool-engine.js, settlement-engine.js, score-gaps.js, settlement.html and
// index.html are precached; a device on v196 keeps refunding it.
// Moved to v198 (v196 in the wave log) because the Results page is rebuilt for
// the payer: 💰 PAY OUT first - one row per golfer owed cash, largest first,
// the reasons on a tap - then one card per game with a coloured head band,
// then NET +/− collapsed; the Not-final line once, on top; the PDF reads the
// same mounts in the same order and prints the reasons open. settlement.html
// is precached; a device on v197 keeps the payouts block and Player Payouts.
// Moved to v199 because the organizer's Players sheet can move a golfer to
// another group: each row has a [Group] selector and the golfer goes to the end
// of the target group (the roster is reordered and groupSizeOverrides rewritten
// in one guarded write; scores, flight, handicap and KP leads never move). A
// device on v198 has no selector and cannot move anyone. index.html is precached.
// Moved to v199-kp-live-group (the same wave, a new cache KEY) because index.html changed AFTER v199 went live: the KP block's
// "(Group N)" reads the live roster, not the kpLeaders stamp a v199 move can
// leave stale. A phone that installed v199 in the meantime would otherwise keep
// the version that shows the old group.
// Moved to v200 because the organizer link is offered where the organizer is and
// can be claimed where a device is stuck: "Share organizer link" on Round Ready,
// the Game tab and the Group Links panel, and "Are you the organizer? Paste your
// organizer link." on the refusal card, the scorecard and the Game tab.
// organizer-gate.js, index.html, admin.html and game.html are precached; a device
// on v199 has neither button and cannot claim a round it set up elsewhere.
// Moved to v201 because the Board reads differently: a blank handicap shows no
// HCP and no Net line, a finished golfer reads F, skins winners carry 🥩 N, the
// rows are compact with the handicap on the name line, the whole row opens the
// card, and the card's header row says SI (the hole's stroke index) not HCP.
// leaderboard.html and scorecard-rows.js are precached.
// Moved to v202 because the Board's header is one line and one control row, a
// field over twelve opens on All Players, the Stroke/Match switch only shows on a
// round that plays a match, and the leader banner is one line - the first golfer
// is 375px down instead of 614, with nine on screen instead of four.
// leaderboard.html is precached.
// Moved to v203 because an organizer can keep the same anonymous account by
// email link. admin.html loads email-link-auth.js (new, precached) and the
// lobby card sends the link and finishes it with linkWithCredential, so the
// trial and a founder pass stay on that uid. A device on v202 has no card,
// and a cached admin.html would call a file the shell never stored.
// Moved to v204 because that same shell is HardPan: the lobby wordmark, the
// install manifest, share-sheet titles, the how-it-works page, and the
// receipt mark's alt. A device on v203 has the email-link card and still
// says Rattle Golf. The native home-screen name is unchanged while iOS 1.0.3
// is in review. email-link-auth.js stays precached.
// Moved to v205 because the web mark is the dimpled ball on firm ground.
// The lobby header is hardpan-lockup.svg (ball + HARDPAN). The tab and PWA
// icons are that ball. logo-mark.png is the same ball, for the receipt and
// the tournament landing. tournament.html in this shell says HardPan
// Tournaments. A device on v204 still shows the circular R above a text
// wordmark. The iOS binary in review is not resubmitted. email-link-auth.js
// stays precached.
// Moved to v206 because the lobby word is HTML. hardpan-lockup.svg drew
// HARDPAN ultra-condensed and stroked it with a non-scaling stroke, so on a
// phone the counters filled and the name read as vertical bars. The header
// is now hardpan-icon.svg (the ball) beside the word HARDPAN in the page
// font. privacy, terms and support use the same pair. A device on v205 keeps
// serving the illegible lockup. The tab and PWA icons stay the ball alone.
// email-link-auth.js stays precached. The iOS binary in review is not
// resubmitted.
// Moved to v207 because a Handicap Index converts to a Course Handicap and
// a Playing Handicap when the tee has Slope, Course Rating, and Par.
// handicap.js, admin.html, index.html and leaderboard.html are precached.
// A device on v206 would keep showing the typed number as the strokes and
// would have no tee-rating fields. The iOS binary in review is not
// resubmitted.
// Moved to v208 because setup on an owned round is the owner's uid, and the
// organizer-link sentences say so. admin.html, organizer-gate.js and
// code-issuer.js are precached. A device on v207 still says the organizer
// link alone can edit the round. The rules file is not in this cache;
// publishing it is a console step. The iOS binary in review is not
// resubmitted.
// Moved to v209 because tournament.html says Rattle Golf again. The landing
// word is Rattle Golf under the ball, Tournaments on the right, and the page
// title is Rattle Golf Tournaments. tournament.html is in this shell list, so
// a device on v208 keeps serving the consumer word on that page. The consumer
// product cache stays consumer-v51-owner-setup. The tournament product cache
// is tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v210 because the course step no longer asks for Slope, Course
// Rating, and Par by hand. A course with rated tees lists those tees and
// fills the three numbers from the one picked, including a course just
// fetched online whose card is not saved yet. A device on v209 still shows
// the manual block and "No tee rating on this course" for that course.
// admin.html is precached. The consumer product cache is
// consumer-v52-tee-autofill. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v211 because editing setup on a LEGACY round (one with no ownerUid)
// now saves instead of refusing. The wizard's save stopped stamping ownerUid
// onto a round that already exists without one - the rules have no arm for
// adding it, so the whole save was one PERMISSION_DENIED, measured in Chrome
// against the real ruleset as `alert("Save error: PERMISSION_DENIED: Permission
// denied")` with nothing written. 96 of the 105 rounds in production are that
// shape. admin.html and organizer-gate.js are precached, so a device on v210
// keeps refusing every legacy round's setup save. Creating a round and editing
// an owned one are unchanged, and still stamp. The rules file is not in this
// cache and is NOT being published. The consumer product cache is
// consumer-v53-legacy-setup-save. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v212 because two things changed on screen. (A) A whole group that
// skipped a hole together is now flagged as a gap instead of reading as
// "started later": the field's group start holes are compared with each other
// (score-gaps.js resolveGroupStarts), so five groups off hole 1 and a sixth
// whose card begins on hole 2 names all four of that group as missing hole 1. A
// shotgun start, a two-tee start and a back-nine round are untouched. (B) The
// handicap math is legible: the Board row and the Players sheet say "Index 18 ·
// Course 17" instead of a bare number, the expanded board card carries the full
// "Index · Course · Playing" form, and the Game tab states the basis once - the
// tee, its Slope and Rating, and that Course Handicaps are converted from GHIN
// Indexes. A round-level setting defaults to that GHIN reading, with "as
// entered" available. index.html, leaderboard.html, game.html, admin.html,
// score-gaps.js and the NEW handicap-labels.js are precached, so a device on
// v211 keeps showing a bare handicap number and keeps missing a whole group's
// skipped hole. No engine changed: handicap.js is byte-identical. The consumer
// product cache is consumer-v54-handicap-legible. The tournament product cache
// stays tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v213 because the Players sheet's handicap box is now the golfer's
// Handicap INDEX on a GHIN round, not their playing handicap. Typing into it
// re-runs the conversion for the round's tee and writes handicapIndex,
// courseHandicap and hcp together - v212 left the box editing hcp while the line
// beside it named an Index, so a hand-edit left the stored Index describing a
// number no longer derived from it. The box is labelled "Index", and the line
// under it shows the Course Handicap the typed index gives, moving as they type.
// An "as entered" round is unchanged: the box is the playing handicap, labelled
// "HCP". A round with no rated tee stores the Index and uses the typed number as
// it stands, marked unconverted. index.html and handicap-labels.js are
// precached, so a device on v212 keeps editing the wrong number. No engine
// changed: handicap.js is byte-identical and does the conversion. The consumer
// product cache is consumer-v55-index-box. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v214 because the email-link confirmation is now written on every
// run. email-link-auth.js's setStatus looked #email-link-status up once and gave
// up if the parser had not reached it yet - install() runs in the HEAD and the
// element is in the BODY, so the sentence was lost whenever the auth promise beat
// the parser. Measured cold: the lookup happened at 14-22ms with the element
// absent (note lost) or at 32-39ms with it present (note landed), and the
// credential was correctly linked in EVERY run either way. The note is now
// remembered and flushed on DOMContentLoaded and load. 15 of 15 cold runs across
// the preserved, second-device and expired-link outcomes now write their
// sentence, 6 of them after hitting the race. email-link-auth.js is precached, so
// a device on v213 keeps losing the confirmation about half the time - the link
// itself always worked. No engine changed. The consumer product cache is
// consumer-v56-link-note. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v215 because of the ALOHA BET: double or nothing on a match's last
// hole, offered by the side that is DOWN money and accepted by the side that is
// up. OFF by default per round ("Allow the Aloha bet on 18" on the wizard's
// Extras card), matches only - Match Play, Nassau and side matches, never the
// Weekly Game, skins, KP or the net finish. One per match, ever; only before a
// score lands on that hole; never by the leader; an all-square match says there
// is nothing to square. The amount is frozen when it is offered. Settled as one
// winner-takes-the-stake wager on that hole: the losing side wins it and the day
// is squared, the leading side wins it and the deficit doubles, a halved hole
// pays nobody. NEW aloha-bet.js carries every rule and is precached; every page
// that settles loads it BEFORE settlement-engine.js, because the engine's call is
// guarded and a page without it would quietly settle the round with no Aloha.
// admin.html, sidematches.html, index.html, leaderboard.html, settlement.html,
// game.html, skins.html, stats.html and trip.html all gained the tag, so a device
// on v214 would show and settle two different totals. money-engine.js is
// byte-identical; settlement-engine.js changed in exactly three approved places
// and carries no Aloha arithmetic. The consumer product cache is
// consumer-v57-aloha. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v216 because the ALOHA BET now works on the MAIN GAME too - the
// round's own Match Play, Nassau, best ball, scramble or Ryder - and not only on
// side matches. v215 shipped it for side matches alone because the approved wiring
// put the main game's Aloha on the Receipt and NOT in the ledger: measured then at
// Receipt net 20 -> 40 with the golfer's ledger net stuck at 10. The fourth edit
// books it where the main game's money is actually booked
// (computeCombinedNetTotals' getRoundGames branch), so the Receipt segment, the
// itemised ledger line and the net totals now carry one number - asserted in both
// directions, and the v215 measurement is kept as a guard. A stroke-play main game
// refuses it, by FORMAT and not merely by a missing stake. The offer row is on the
// Matches tab above the side matches; the main game's record lives at
// matchPresses/aloha and a side match's on itself, one function knowing both.
// aloha-bet.js and sidematches.html are precached, so a device on v215 would offer
// nothing on the main game and settle nothing for it. money-engine.js is
// byte-identical; settlement-engine.js carries the four approved edits and no
// Aloha arithmetic. The trip footer sentence is unchanged: the ledger label is
// prefixed "Main Game ·" so it is covered by the category already named there.
// The consumer product cache is consumer-v58-aloha-main. The tournament product
// cache stays tournament-v54-rattle-golf. The iOS binary in review is not
// resubmitted.
// Moved to v217 because a listed golfer can Confirm or mark out before tee time.
// The headcount lives at events/<code>/attendance/<playerId> and is drawn on the
// scorecard, on setup, on Round Ready, and on each Road Trip day. attendance.js
// is new and precached; index.html, admin.html and trip.html load it. A device
// on v216 has the roster and no way to say who is actually playing. No engine
// changed. The consumer product cache is consumer-v59-attendance. The tournament
// product cache stays tournament-v54-rattle-golf. The iOS binary in review is
// not resubmitted.
// Moved to v218 because there is now ONE calculateMatchEngine. It was three: the
// copy in money-engine.js plus a full inline copy in index.html and another in
// stats.html, and because an inline <script> parses after the external ones, the
// PAGE copy was the one that ran on the scorecard and on Stats. They had drifted -
// both pages escaped the winner name inside the engine, index.html returned a
// pressesByHole nothing read, stats.html dropped t1Players/t2Players. Measured
// before deleting: 3 copies, 13 fixtures, 0 disagreements beyond those fields, so
// no golfer had been paid wrongly yet. match-engine.js is new and precached; all
// nine match pages load it right after handicap.js. A device on v217 that gets a
// partial update has a page whose engine is missing and whose callers all guard
// with typeof - it would show a match with no money rather than an error, which is
// why the file is in the shell list above. Escaping moved to the sinks, which also
// closed a pre-existing gap on the Receipt and on the Board's head-to-head banner.
// No arithmetic changed: money-engine.js lost the function and gained a pointer
// comment, and nothing else in it moved. The consumer product cache is
// consumer-v60-one-match-engine. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v220 because the Board's team view was scoring GROSS Ryder Cup and
// Scramble rounds as NET. leaderboard.html derived its match scoring type from a
// cascade of ifs that named nassau, match and bestball only, so those two match
// formats fell through to the default and the organizer's GROSS setting was
// discarded. On a gross Ryder round where every hole was halved it gave an
// 18-handicapper a stroke on all eighteen and printed "Ann 10 & 8", while
// money-engine.js paid nobody and this page's OWN engine widget, a few lines
// above it, read AS. An installed device on v219 keeps showing the invented
// result. Now a ternary - nassau takes nassauScoring, everything else takes
// matchScoring - which is the shape money-engine.js:768 and
// settlement-engine.js:811 have always used, so no format list can go stale
// again. Display only: no engine and no money moved, and the money was never
// wrong. The consumer product cache is consumer-v61-board-gross-match. The
// tournament product cache stays tournament-v54-rattle-golf. The iOS binary in
// review is not resubmitted.
// Moved to v221 because three more surfaces were scoring GROSS Ryder Cup and
// Scramble rounds as NET. v220 fixed the Board; these are the rest of the same
// defect, and index.html's was the one that mattered most: its scoringType is
// passed into calculateMatchEngine, so the number on the scorecard was COMPUTED
// with handicaps, not merely labelled wrong. On a $20 gross Ryder round where
// every hole was halved the ticker read "FINAL: Ann 10&8" while money-engine.js
// paid nobody - the scorecard told a golfer they had won a match the Receipt
// settles at zero. game.html's "how it is scored" sentence said the same thing in
// words. stats.html had a different bug in the family: it read
// `nassauScoring || matchScoring || "net"`, the wrong SOURCE rather than the wrong
// default, so a ryder round holding a stale nassauScoring was settled gross.
// An installed device on v220 keeps all three. The money was never wrong.
// No engine and no protected file changed. The consumer product cache is
// consumer-v62-gross-means-gross. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v222 because the SEASON LEDGER landed: seasons/<code> totals finalized
// Results money, skins and KP across every round one crew plays. season.html and
// season.js are new and precached, admin.html links a saved round back to the
// season, and Game Day opens the ledger. A device on v221 has each round's Results
// and no running total.
//
// The season branch was cut from v217 and asked for 'golfapp-v218-season', which
// v218 had already taken; landing it on this key would have handed every installed
// device a cache name it already holds and no update. Its own note said
// "consumer-v60-season" for the same reason - also taken, by v218. Both moved to
// the next free pair.
//
// NO MONEY ENGINE CHANGED, and nothing v218 through v221a shipped was reverted to
// make room: match-engine.js is still the ONE calculateMatchEngine and the season
// pages never declare one. database.rules.json gains the seasons rows IN-REPO
// ONLY - not published - so live season writes may refuse until they are, which is
// expected. The consumer product cache is consumer-v63-season-ledger. The
// tournament product cache stays tournament-v54-rattle-golf. The iOS binary in
// review is not resubmitted.
// Moved to v223 because the Board's team view was still scoring the match
// itself: best net or best gross, absolute strokes, and a close window of
// `18 - hole`. The LIVE MATCHES widget on the same screen calls
// calculateMatchEngine. On five of the fourteen corpus rounds the two
// disagreed — a 2v2 best ball read 7 & 6 against the engine's 8 & 6, a
// nine-hole match read "1 UP" against "3 & 2". The banner now makes one
// engine call per pair, on a virtual two-team roster, and keeps only the
// total match. Names and the "3 & 2" wording stay the board's; the numbers
// are the engine's. An installed device on v222 keeps the invented margin.
// Display only: no engine and no money moved. The consumer product cache is
// consumer-v64-board-team-engine. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v226 because the Action page no longer speaks through the browser.
// alert/confirm/prompt put "golf-app-5a5.pages.dev says" (or the capacitor://
// origin in the app) above every message, which reads as a website error rather
// than a scorecard. sidematches.html is the pilot: its 45 calls are now 22 inline
// refusals, 11 persistent failures, 8 toasts, one decision sheet and two amount
// sheets - and ONE native prompt, kept on purpose, because it is the clipboard
// fallback whose whole job is to hand a golfer selectable text after the
// clipboard API has already failed.
//
// THE SPLIT IS THE POINT. A refusal means the action did not happen, so it is
// inline next to the dead control and it stays. A failed write - "PRESS NOT
// SAVED, nothing was created" - is persistent and never self-dismisses, because a
// golfer who misses it believes they have a $20 press that does not exist. Only a
// success receipt floats, and its dwell scales with its lines.
//
// ui-dialogs.js is new and precached. A device on v225 keeps the browser dialogs.
// No money moved: no engine and no protected file changed, and the press amount
// that lands is still the number typed - uiAmount returns a number or null and
// never NaN, which prompt() could not promise.
//
// index.html, admin.html and trip.html are NOT converted yet; their remaining
// native decisions are counted and pinned in dialog_await_guard_test.js so the
// sweep cannot be forgotten. tournament.html is the other product and is out.
// The consumer product cache is consumer-v67-ui-dialogs. The tournament product
// cache stays tournament-v54-rattle-golf. The iOS binary in review is not
// resubmitted.
// Moved to v227 because the SCORECARD stops speaking as a website too. UI Wave 2
// sweeps index.html the way Wave 1 swept the Action page: 35 alerts become 11
// inline refusals, 20 persistent failures and 4 toasts, and its THREE decisions -
// record that nobody won the KP, cancel all KPs for the round, and delete the
// round for everyone - go through the shared sheet and are awaited.
//
// DELETE ROUND IS THE ONE THAT MATTERED. It was written `if (confirm(msg))`, so a
// missed await would have made it ALWAYS TRUE and deleted every score, bet, press
// and side match for everyone without asking. It is now driven both ways in real
// Chrome, which was impossible before Wave 1 taught cold-arrival about native
// dialogs, and Cancel is the focused control so nobody deletes a round by
// double-tapping where the last button was.
//
// ui-dialogs.js is REUSED, not forked - no second copy of the component or its
// CSS. A device on v226 keeps the browser dialogs on the scorecard. No engine and
// no protected file changed; the KP money paths still ask before they move
// anything, proven both ways. admin.html and trip.html are still unconverted and
// their remaining decisions are counted in dialog_await_guard_test.js so the last
// of the sweep cannot be forgotten. The consumer product cache is
// consumer-v68-index-dialogs. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v228 because the SETUP WIZARD stops speaking as a website. UI Wave 3
// sweeps admin.html - the biggest of the three by a distance: 38 alerts become 18
// inline refusals, 14 persistent failures and 6 toasts, five decisions go through
// the shared sheet awaited (whole-dollar settling, removing a skins game, removing
// a golfer who has posted scores, starting a round with unnamed golfers, and
// delete round), and the LAST prompt() in the app - the game-code tool behind the
// five-tap panel - becomes an inline field.
//
// THE TYPED ONE IS THE NEW SHAPE. uiPrompt resolves to a trimmed, uppercased
// string or to null, and null covers cancelled AND empty so the two cannot
// diverge. Its answer is not a yes or no: it names the round whose payouts change,
// and a test drives three spellings of one code through the page to prove the
// path that lands is the string typed.
//
// Delete round on this page got the same treatment index.html got in v227 - both
// answers in real Chrome at 390x844, Cancel first in the DOM and holding the
// focus - because each page's inline script owns its own copy of that function and
// one page's proof is not the other's.
//
// A device on v227 keeps the browser dialogs on the setup wizard. No engine and no
// protected file changed. admin.html's own .modal-overlay was deliberately LEFT as
// it is rather than reconciled with the other two: after the sweep it dresses one
// element and nothing in the shared component reads it, while lowering its z-index
// to match would put that modal under this page's own dropdown. trip.html is the
// last unconverted page and its one remaining decision is counted in
// dialog_await_guard_test.js. The consumer product cache is
// consumer-v69-admin-dialogs. The tournament product cache stays
// tournament-v54-rattle-golf. The iOS binary in review is not resubmitted.
// Moved to v229 because the SWEEP IS FINISHED. UI Wave 4 takes the last three
// consumer pages: trip.html (26 tells and the LAST native decision in the app),
// skins.html (5) and season.html (9, tells only). No consumer page asks a golfer
// anything through a browser dialog any more. A device on v228 keeps the browser
// dialogs on the Road Trip, Skins and Season pages.
//
// THE LAST DECISION was unlinking a round from a trip. The round survives - that
// is what the question says - but the trip leaderboard, the money settlement, the
// points race and the awards all stop counting it, so it is money on three
// surfaces. Awaited, driven both answers, and the organizer gate is asserted to
// come before the question rather than instead of it.
//
// ONE BEHAVIOUR CHANGE, forced by the conversion rather than chosen: "Trip not
// found" used to alert and then reload. A native alert BLOCKS so the sentence was
// read first; an inline note does not, and the reload would have wiped it. Renaming
// that line alone would have shipped an invisible message. The reload is gone; it
// only stripped the query string, since the page never hid the setup screen on
// that path, and the resume row it used to supply is now shown explicitly - so the
// refusal and the way out are on screen together.
//
// The three clipboard fallbacks became notes rather than toasts, because by the
// time one runs copying has already failed and the only useful thing left is text
// that can be SELECTED. sidematches.html keeps its single native prompt, decided
// in Wave 1 and asserted as kept rather than forgotten.
//
// No engine and no protected file changed. The consumer product cache is
// consumer-v70-sweep-done. The tournament product cache stays
// tournament-v54-rattle-golf - that is the other product, still on its own
// dialogs, and the guard names it as out of scope rather than omitting it. The iOS
// binary in review is not resubmitted.
const CACHE_VERSION = 'golfapp-v229-sweep-done';

// Every file the shell actually needs. The old list predated the shared engine files
// and the pages added since, so those were only ever cached opportunistically at
// runtime - fine online, useless on the first offline launch at a remote course.
//
// THE RULE: if a page is listed here, every script that page loads must be listed too.
// These engines are plain <script src> globals and their call sites guard them with
// `typeof fn === 'function'`, so a missing engine does not throw - it silently does
// nothing. pool-engine.js was missing from this list while index.html, admin.html and
// settlement.html all load it, which meant an offline Money Pool computed as zero and
// disappeared from the banner, the receipt and the settlement totals with no error shown.
// bundle_manifest_test.js enforces the rule now.
const SHELL_FILES = [
    './index.html',
    './admin.html',
    './leaderboard.html',
    './skins.html',
    './stats.html',
    // score-gaps.js (v192): shared by index, leaderboard and settlement.
    './score-gaps.js',
    // The Game tab (v186): what is being played, on every link. stats.html stays
    // precached - it has no tab now, but nothing that reaches it by URL should
    // hit the offline page.
    './game.html',
    './settlement.html',
    './sidematches.html',
    './trip.html',
    // season.html (v222): the running ledger. admin.html links here from Game Day.
    './season.html',
    // Tournament Mode. Linked from admin.html and trip.html, and shipped to the
    // mobile bundle - but omitted here until v6, which is why a first-time offline
    // launch showed the "No connection" page.
    './tournament.html',
    './tournament-scorecard.html',
    './instructions.html',
    './shared.html',
    // Shared engines. index.html cannot render a scorecard without these.
    // grouping.js decides which golfer is in which foursome, which every ?group=N
    // link and every group-scoped write is measured against. Four pages load it;
    // an offline launch without it would not degrade, it would break the page.
    './grouping.js',
    // Every page that can START something loads this: it issues the code and
    // checks it is free first. Precached, or the first offline launch cannot
    // open the setup screen at all.
    './code-issuer.js',
    // handicap.js is every stroke a golfer receives. Eight pages load it, and they
    // call it unguarded, so a cached shell missing this file does not compute a
    // wrong number - it fails to render at all, which is the correct failure.
    './handicap.js',
    './handicap-labels.js',
    './aloha-bet.js',
    // payouts.js is the place/tie prize rule, shared by Trip Mode and both
    // tournament pages. Called unguarded, so a cached shell without it breaks the
    // prize table rather than quietly paying nobody.
    './payouts.js',
    // product-links.js resolves cross-product navigation. Three pages call it
    // unguarded; a cached shell without it breaks those links rather than
    // silently sending a golfer to a page that does not exist.
    './product-links.js',
    // Print / Save on iOS. settlement.html and trip.html call it unguarded from
    // their print buttons; a cached shell without it would restore the dead button.
    './native-export.js',
    './score-marks.js',
    './scorecard-rows.js',
    './text-safe.js',
    // ui-dialogs.js (v226): the telling, asking and typing this app does for
    // itself. NO APOSTROPHES IN THIS BLOCK - the shell list is read by matching
    // single-quoted strings, so one apostrophe swallows the rest of the array.
    // Replaces
    // alert/confirm/prompt, which render "golf-app-5a5.pages.dev says" over every
    // message. sidematches.html loads it UNGUARDED - it calls uiRefuse/uiFail/
    // uiToast on paths a golfer reaches within seconds - so a cached shell without
    // it does not degrade the page, it breaks it, which is the correct failure.
    './ui-dialogs.js',
    // attendance.js (v217): Confirm or mark out before tee time. index, admin and
    // trip load it. A cached shell without it shows the roster and never the
    // headcount.
    './attendance.js',
    // match-engine.js (v218) is calculateMatchEngine - hole-by-hole match play, and
    // the money every Match, Nassau, Best Ball, Scramble and Ryder round settles
    // to. All NINE pages that touch a match load it, and money-engine.js,
    // settlement-engine.js, ryder-cup.js, bet-strip.js and aloha-bet.js each call
    // it through a `typeof` guard - so a cached shell missing this file does not
    // break loudly, it settles rounds with no match money and no error. Precached
    // for exactly that reason.
    './match-engine.js',
    // season.js (v222): the season record and the ledger. season.html and
    // admin.html load it. A cached shell without it can open a round and
    // cannot total one.
    './season.js',
    './money-engine.js',
    './settlement-engine.js',
    // ryder-cup.js is loaded unguarded by index.html, so a cached shell without it
    // does not degrade the Cup card - it breaks the page. Precached for that reason.
    './ryder-cup.js',
    './action-model.js',
    './bet-strip.js',
    './hole-events.js',
    './pool-engine.js',
    // live-skins.js decides which config each live skins surface builds its
    // ledger from (the wager itself, or the pool bucket). index.html,
    // leaderboard.html and settlement.html all load it.
    './live-skins.js',
    './course-data.js',
    './course-import-rules.js',
    // Both tournament pages load this; a cached page without its engine renders a
    // broken shell, which reads as "the app is working" and is worse than the
    // offline notice.
    './tournament-engine.js',
    './qrcode.min.js',
    './pwa-boot.js',
    // THE FIREBASE SDK, SERVED FROM THIS ORIGIN.
    //
    // Every data-bearing page loads these from gstatic today, so a genuinely cold
    // offline launch throws `ReferenceError: firebase is not defined` before any
    // page script runs. Precaching them here removes that dependency.
    //
    // ORDER MATTERS AT RUNTIME: firebase-app-compat.js defines the global that
    // firebase-database-compat.js attaches to, so a page must load app first. The
    // order in this array does not itself control that - it is the <script> tags on
    // each page that do - but they are listed in dependency order so the intent is
    // visible to whoever edits this next.
    //
    // Batch 7A only makes them available. The 11 pages still point at gstatic; 7B
    // flips them over.
    './firebase-app-compat.js',
    './firebase-database-compat.js',
    // The auth-compat build of the same 9.22.2 release. Since v139 every
    // Consumer page signs in anonymously at boot through auth-boot.js, which
    // fetches this file asynchronously from beside itself - so both are
    // precached, and a second offline launch restores the persisted user with
    // no network. tournament.html loads the SDK with its own tag.
    // NO APOSTROPHES IN THIS BLOCK - three tests read this list by matching
    // every single-quoted run, and a contraction becomes a shell file.
    './auth-boot.js',
    './firebase-auth-compat.js',
    // THE ORGANIZER GATE (Wave 3, v147): admin.html and trip.html load it after
    // auth-boot.js; it awaits the token, writes the organizer clock and stamps
    // ownerUid on every round they create, and says the wall in words.
    './organizer-gate.js',
    // Email-link sign-in (v203). admin.html loads it on the lobby. A cached
    // shell without this file shows the button and the click does nothing.
    './email-link-auth.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './logo-mark.png',
    // Ball icon, favicon, and the outlined lockup (v205, word opened in v206).
    // The lobby header is the icon plus HTML text; the lockup file stays
    // precached so a direct open is the readable outline, not the old bars.
    // Flat names: a slash in this list is refused.
    './hardpan-lockup.svg',
    './hardpan-icon.svg',
    './favicon-32.png'
];

self.addEventListener('install', (event) => {
    // Cached one file at a time, deliberately.
    //
    // cache.addAll() is atomic: if any single request 404s, the whole promise rejects
    // and NOTHING is written to the cache. The previous version wrapped that in a
    // .catch() whose comment claimed "whatever succeeds still gets cached" - which is
    // not how addAll behaves. One bad filename would have silently turned off offline
    // support for the entire app, and the swallowed rejection meant nothing would ever
    // have surfaced it. For an app whose job is to work on a course with no signal,
    // that is the wrong way round: a single missing file should cost that one file,
    // not the whole shell.
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => Promise.all(
            SHELL_FILES.map((file) => cache.add(file).catch((err) => {
                // Logged rather than swallowed, so a broken entry is findable in
                // Safari/Chrome devtools instead of failing invisibly.
                console.warn('[sw] could not cache', file, err);
            }))
        ))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only handle same-origin GET requests for the app shell. Everything else
    // (Firebase calls, external scripts, POSTs, etc.) passes straight through
    // to the network untouched. Firebase Realtime Database runs on a different
    // origin over its own WebSocket, so none of this touches live data sync.
    //
    // AND /api IS NOT THE SHELL. The course proxy (functions/api/) answers from
    // this origin, so it used to be intercepted like a page: every response -
    // a 503 {status:"unavailable"} included - was cache.put() below, because
    // the Cache API ignores the Function's cache-control: no-store, and offline
    // a golfer got that stale refusal back, or the HTML "No connection" shell
    // where a JSON body was expected. The proxy's KV is its cache; this worker
    // leaves /api entirely to the browser's own fetch, so a refusal is never a
    // document and an offline call simply rejects into the caller's catch.
    // Matched on the PATHNAME - a shell URL whose query happens to contain
    // "/api" is still the shell.
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin
        || /^\/api(\/|$)/.test(url.pathname)) {
        return;
    }

    // A page request, as opposed to a script/icon/manifest request.
    const isNavigation = request.mode === 'navigate' || request.destination === 'document';

    // WHY THE QUERY STRING HAS TO BE IGNORED FOR PAGES
    //
    // Cache lookups match the FULL url, query string included. Every real link
    // this app hands out carries one:
    //
    //     index.html?game=ABCD&group=1     scorekeeper
    //     index.html?game=ABCD             organizer
    //     settlement.html?game=ABCD        receipt
    //
    // The install handler precaches './index.html' with no query at all, so a
    // plain lookup for any of those misses, respondWith() resolves to undefined,
    // and the navigation fails outright. The precached shell could never serve a
    // single URL a golfer actually opens.
    //
    // Ignoring the query string on page requests fixes that, and it is safe here
    // for a specific reason worth stating: every page in this app derives its
    // identity at runtime from window.location.search - the live document URL,
    // not the cache key. index.html reads `new URLSearchParams(window.location.search)`
    // to set currentMode and lockedGroup; the other nine pages do the same. So a
    // Group 2 scorekeeper served the shared cached shell still reads group=2 from
    // their own address bar and stays locked to Group 2. The HTML bytes are
    // identical for every group; only the URL differs, and the URL is preserved.
    //
    // Scripts and icons keep exact matching - they have no query strings, and
    // loosening the match there would gain nothing.
    async function fromCacheOrOffline() {
        const exact = await caches.match(request);
        if (exact) return exact;

        if (isNavigation) {
            const shell = await caches.match(request, { ignoreSearch: true });
            if (shell) return shell;
        }

        // Never resolve to undefined. respondWith(undefined) throws a TypeError
        // and produces a blank failed navigation with nothing to explain it.
        return new Response(
            '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>Offline</title></head><body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px 24px;">'
            + '<h1 style="font-size:3rem;margin:0;">\u26F3</h1>'
            + '<h2 style="color:#1d3557;">No connection</h2>'
            + '<p style="color:#666;line-height:1.5;">This page has not been opened on this device yet, so there is nothing saved to show. '
            + 'Reconnect and reload.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    // Network-first: always prefer the latest deployed version when online, so a
    // fresh deploy shows up on the next navigation rather than being trapped
    // behind a stale cache entry. Cache is purely the no-connection fallback.
    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
                return response;
            })
            .catch(() => fromCacheOrOffline())
    );
});
