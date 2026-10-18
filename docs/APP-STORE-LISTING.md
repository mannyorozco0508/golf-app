# HardPan 2.0 - App Store listing (DRAFT for Manny to paste; mailbox 007, 2026-10-17; GPS features added in 008, 2026-10-18)

Pricing (007): games, scoring and settling up are FREE. EVERY GPS feature needs the GPS Map
subscription (com.rattlegolf.app.gpsmap.yearly, group "HardPan Plus"): a 7-day free trial, then
$24.99/year founding price for the first 1,000 subscribers (kept while they stay subscribed), then
$34.99/year for new subscribers. There is no free GPS. Nothing below says "free GPS", and the name and
subtitle never say bet / wager / gamble.

## Name (30 max)
HardPan: Golf GPS & Games            (25)

## Subtitle (30 max)
GPS yardages + your golf games       (30)

## Promotional text (170 max; can change without a new build)
GPS to every green, plus your group's games, scored live. Games are always free. GPS: 7-day free
trial, then a founding price of $24.99/year for our first 1,000 golfers.
(169 - update to the standard price when the founding window closes.)

## Description (4000 max)
HardPan is golf GPS and a live scorecard for the games your group already plays.

GPS
- Front, middle and back yardages to every green, and to any spot you tap on the map
- Wind and plays-like distances
- Satellite view of each hole, tee to green, and a hole preview that flies you down the hole to the green
- Moves to the next hole by itself when you walk onto the next tee (you can turn it off)
- Hazards and layups: yards to reach and carry the bunkers and water on the hole, where the course
  map has them
- Your club distances: enter your carries or let HardPan learn them from the shots you mark, and it
  suggests a club from the plays-like distance (slope where US elevation data exists, wind,
  temperature) - with the breakdown shown
- Quick stats as you play (putts, fairways, greens in regulation) and a My stats page
- HardPan Index: an unofficial handicap-style number from your rounds (not an official handicap)
- Works for every golfer in your group, on their own phone

GAMES (always free)
- Live scorecard everyone in the group enters scores into
- Live leaderboard, net and gross
- Nassau, skins, KPs, a weekly pool, Wolf, Vegas, Bingo Bango Bongo, team matches and more
- Start a round in seconds, or set up a multi-day trip
- At the end, HardPan shows who owes who - you settle up between yourselves. HardPan never holds or
  moves money.

GPS REQUIRES A SUBSCRIPTION
HardPan GPS (the GPS Map subscription) starts with a 7-day free trial, then $24.99/year. That is our
founding price for the first 1,000 subscribers, and it stays yours for as long as you stay
subscribed. Games, scoring and the leaderboard never need a subscription.

Payment is charged to your Apple ID when the free trial ends. The subscription renews automatically
each year unless it is cancelled at least 24 hours before the end of the current period. Your Apple
ID is charged for renewal within 24 hours before the end of the current period. Manage or cancel any
time in Settings > Apple ID > Subscriptions. Any unused part of a free trial ends when you buy a
subscription.

Terms of Use: https://golf-app-5a5.pages.dev/terms.html
Privacy Policy: https://golf-app-5a5.pages.dev/privacy.html
(Also set the App Store "License Agreement" to the standard EULA or link the Terms above, and put the
Privacy Policy URL in App Privacy.)

Wording rules (008): the HardPan Index is always "unofficial" and is never called USGA, GHIN or
an official handicap. No Apple Watch line: the Watch app is a plan and a scaffold only, not built
into the app. Hazards say "where the course map has them" because some courses have no hazard data.

## Keywords (100 max, comma separated, no spaces)
golf,gps,yardage,rangefinder,scorecard,nassau,skins,leaderboard,golf games,handicap,course,tee times
(100 - at the limit)

## What's New (2.0)
- HardPan GPS: yardages to every green, wind and plays-like - 7-day free trial
- GPS: auto-advance holes, hazards and layups, club suggestions from the plays-like distance, a hole
  preview that follows the fairway, quick stats and the unofficial HardPan Index
- New icon
- Games, scoring and the leaderboard stay free

## Screenshot captions (the 10 in ~/Desktop/HardPan-screenshots-v2/final-10; images unchanged)
| # | File | Caption | Small line |
|---|---|---|---|
| 1 | 01-02-home-doors.png | GPS and your games, in one app | Games are free |
| 2 | 02-15-gps-hole1.png | Front, middle and back to every green | GPS: 7-day free trial |
| 3 | 03-05-scorecard-hole3-kp.png | Everyone scores on their own phone | Free |
| 4 | 04-08-leaderboard-in-progress.png | A live leaderboard, net and gross | Free |
| 5 | 05-10-bets-saturday-nassau.png | Nassau, skins and KPs, tracked for you | Free |
| 6 | 06-12-results-in-progress-kp-pool.png | Who owes who, done for you | Free |
| 7 | 07-17-gps-hole5.png | Tap anywhere for the yardage | GPS: 7-day free trial |
| 8 | 08-01-setup-road-trip-game-day.png | A round or a whole trip, set up in seconds | Free |
| 9 | 09-18-gps-hole9.png | Wind and plays-like on every shot | GPS: 7-day free trial |
| 10 | 10-09-leaderboard-final.png | Final results for the whole group | Free |
No price on the images: a price there can't be localized and would be wrong for the $34.99 standard
price; the description and the paywall (StoreKit, localized) carry the price.

## Counting the first 1,000 subscribers (plan only - nothing built)
Recommended: **RevenueCat**, which the app already uses for the entitlement.
- Watch the count: the RevenueCat dashboard shows active subscriptions / trials for the GPS Map
  product in real time - no code, nothing to deploy. Manny checks it; at 1,000 he raises the price in
  App Store Connect ("keep current price for existing subscribers") and sets
  gps_meta/config.foundingOpen = false (one value in the Firebase console), so the paywall switches
  to the standard wording.
- Later, if wanted: a RevenueCat webhook -> a small Cloud Function that keeps a count in
  gps_meta/subscribers and flips foundingOpen at the cap. (The price change itself stays manual - App
  Store Connect has no API for "keep current price" changes worth automating at this size.)
Alternative: App Store Server Notifications V2 -> a Cloud Function (verify Apple's signed JWS, count
SUBSCRIBED / DID_RENEW / EXPIRED per originalTransactionId). It works without RevenueCat but means
building and maintaining the signature checks and the transaction bookkeeping ourselves; with
RevenueCat in the app already, it duplicates what the dashboard gives for free.
Note on the count: "first 1,000 subscribers" should count paid subscribers (after the trial), not
trials - RevenueCat shows both; decide which one the cap means.

## Why one product, not two
Apple's price change with "keep the current price for existing subscribers" gives exactly
"founding price locked while subscribed" on ONE product. A second product (founding vs standard)
would need two products in the group, the app choosing which to show, and upgrade / crossgrade
rules - more to build and review for no gain.
