# HardPan 2.0: App Review notes, age rating, privacy label (DRAFT for Manny)

Mailbox 004 item 7 (and item 5's label answers). Paste into App Store Connect after Manny's review.
Nothing here is submitted.

## Review notes (App Review Information > Notes)

HardPan is a golf scorecard for friends playing together: one person sets up a round, everyone
scores on their own phone, and the app keeps the leaderboard and the friendly side games (Nassau,
skins, KPs and similar) for the group. The app never holds, sends or moves money. It only shows a
summary of who owes whom from the group's own agreed games; players settle up between themselves,
outside the app. There is no payment processing, no deposits, no wagering with the app or any
operator, and no cash-out.

GPS (the paid part, an auto-renewing yearly subscription with a 7-day free trial) shows yardages to
the front, middle and back of the green and to any point tapped on the map. Location is used on the
device only, while the app is open; a position leaves the phone only when the golfer taps "set the
green here" while standing on a green.

To try it without being on a golf course:
1. Open the app. On Home, tap Games & Bets, then Join, and enter the code ZNBLP8. This opens a
   sample round (Caledonia Golf & Fish Club, 4 golfers) as a spectator: the card, the leaderboard
   and the games are view-only.
2. To start your own round: Games & Bets > Start a round, pick any course from the search, add a
   couple of golfer names, Save. Scores entered there are yours.
3. GPS: tap GPS on Home and pick a course. Off the course, the map still opens on that course and
   shows the holes and greens; yardages are measured from your position, so away from a course they
   are large numbers (this is expected). The subscription screen is reached from the GPS screen
   (Pro features); Restore Purchases is on that screen.
Sign-in is optional (Apple, Google or an email link) and only needed to keep rounds across devices.
Account deletion: Account > Delete account (in the app).

(Manny: if you'd rather give review a round with games already set up, create one on a test account,
put a Nassau and skins on it, and replace ZNBLP8 above.)

## Age rating questionnaire (proposed answers)
- Cartoon or fantasy violence; realistic violence; prolonged graphic violence: None
- Sexual content or nudity; graphic sexual content: None
- Profanity or crude humor: None
- Alcohol, tobacco or drug use or references: None
- Mature / suggestive themes; horror / fear themes: None
- Medical / treatment information: None
- **Simulated gambling: None.** The app has no gambling mechanics (no slots, cards, chips, odds or
  random payouts); golfers record their own agreed side games, scored from real golf.
- **Contests: None.** (There are no prizes awarded by the app.)
- **Gambling (real money): No.** The app does not take, hold or pay out money.
- Unrestricted web access: No (the app shows its own pages; Terms / Privacy open in the app).
- User-generated content: rounds and names are shared only with people who have the round code;
  there is no public feed. Answer "No" unless App Store Connect treats shared rounds as UGC - then
  the in-app report contact is support.html.
- Expected rating: 4+.

## Privacy label (App Store Connect > App Privacy) - matches PrivacyInfo.xcprivacy
Data used to track you: **None.**

Data linked to you (all for **App Functionality** only):
| Type | What it is |
|---|---|
| Contact Info > Name | Golfers' names typed into rounds, trips and tournaments |
| Contact Info > Email Address | Sign-in with email link / Apple / Google (optional) |
| Location > Precise Location | Only a green position the golfer chooses to set where they stand |
| Identifiers > User ID | The Firebase account id |
| Identifiers > Device ID | The push notification token (only if notifications are allowed) |
| User Content > Other User Content | Rounds: scores, handicaps, games |
| Purchases > Purchase History | When the GPS subscription ships (Apple / the purchase SDK) |

Data not linked to you: none. Not collected: health, financial info, contacts, browsing / search
history (course searches are sent to the course service to answer them, not stored with the
account), diagnostics (no crash or analytics SDK in the app - re-check if one is added).

Third parties the label must cover (they receive data to do their job, not to track):
Google Firebase (account, database, functions, push), the course-data provider GolfAPI (course
search queries, through our server), Apple WeatherKit and the US National Weather Service (a
course's coordinates for wind, not the golfer's), map imagery (USGS) and OpenStreetMap (map tiles /
course shapes for the course area).
