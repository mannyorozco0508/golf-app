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
const CACHE_VERSION = 'golfapp-v84-the-pill-counts-and-does-not-advise';

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
    './settlement.html',
    './sidematches.html',
    './trip.html',
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
    // handicap.js is every stroke a golfer receives. Eight pages load it, and they
    // call it unguarded, so a cached shell missing this file does not compute a
    // wrong number - it fails to render at all, which is the correct failure.
    './handicap.js',
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
    './text-safe.js',
    './money-engine.js',
    './settlement-engine.js',
    // ryder-cup.js is loaded unguarded by index.html, so a cached shell without it
    // does not degrade the Cup card - it breaks the page. Precached for that reason.
    './ryder-cup.js',
    './action-model.js',
    './bet-strip.js',
    './hole-events.js',
    './pool-engine.js',
    './course-data.js',
    // Both tournament pages load this; a cached page without its engine renders a
    // broken shell, which reads as "the app is working" and is worse than the
    // offline notice.
    './tournament-engine.js',
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
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './logo-mark.png'
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
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
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
