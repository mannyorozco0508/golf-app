# Homepage comparison: sources (Price B + D, Manny's pick 2026-11-16 13:34 via the Advisor, ADVISOR-20261116-1335-OK-build-price-BD)

The homepage shows one comparison figure beside the founding price, `compare.othersUpTo` in site-pricing.js, and a block
"Everything your group needs, in one app" with a "Typical golf GPS app" column. No competitor is named on the page. Every
figure and every cell below was read from the apps' own public pages on **Nov 16, 2026** (`compare.checkedOn`). "Not found"
means not on any public page that loaded; it never means the app lacks it. When any of this changes, change the page copy,
this file and `compare.checkedOn` in one commit (hardpan_home_price_test.js binds the page's cells to this file).

## The figure: "Popular golf GPS apps charge up to $99.99/yr"
Yearly US prices of the top tier (in-app or web):
- 18Birdies Premium $99.99/yr ($19.99/mo, $7.99/wk) — https://18birdies.com/premium ; App Store id892700751
- SwingU Plus $59.99/yr, Pro $99.99/yr — https://help.swingu.com/article/24-how-much-does-swingu-cost ; https://swingu.com/
- Golfshot Pro $79.99/yr ($17.99/mo), Champions $99.99/yr — https://golfshot.com/golfshot-free-vs-pro ; https://shotzoom.zendesk.com/hc/en-us/articles/360000956554
- Hole19 Premium $69.99/yr, Intelligence $99.99/yr — US App Store id794462227 (the site prints euros: https://hole19golf.com/premium)
The saving on the band ("up to $75 a year less") is computed in site-pricing.js from this figure and the headline price.

## The block's "Typical golf GPS app" column
| Row (HardPan: in the app today) | Cell on the page | What the four say |
|---|---|---|
| Every yard, every hole, and the number it plays (wind + elevation) | GPS in all of them; the plays-like number is often a paid upgrade | GPS free in all four (Golfshot free = centre only); plays-like is a paid tier in 18Birdies (Premium, help article 661), SwingU (Plus, help 24), Hole19 (Premium, /premium); Golfshot: not found |
| Green slope from lidar, with the safe side to miss | Green maps are often a paid upgrade, not on every course | 18Birdies Premium 3D green maps (StrackaLine, not every course), SwingU Plus Green Maps (20,000+ courses), Golfshot Pro Green Maps; Hole19: not found |
| Side games scored live: skins, Nassau, 2v2, match play, with the money | Varies; often a paid upgrade, and the money is worked out by hand | 18Birdies free (help 552, 57: units per skin, no settlement); SwingU Plus (help 112); Golfshot Pro (zendesk 360021858093); Hole19 Premium match/team formats; money settlement: none found |
| One live board for the whole group | Most have one | 18Birdies (help 772), SwingU and Hole19 (LivePlay) free; Golfshot through a Golf Genius code |
| Settle up with Venmo from the recap | Not found in the popular apps | Venmo or any payment link: none found on the four |
| Tournaments: live 36-hole board, the board on a TV, check-in, entry fees by Venmo | A live board, often through a partner site; TV board, check-in and entry fees not found | Live board in all four (Golfshot and SwingU through Golf Genius); TV display, check-in, buy-ins: none found |
| Ask HardPan, in plain words | AI labels vary; an ask-the-app chat was not found | 18Birdies AI Coach (swing video), SwingU AI Digital Caddie (yardages), Hole19 Otto (reports), Golfshot Siri distances only; an ask-the-app chat: none found |
| Works with no signal | Most do, with limits (start the round with signal) | 18Birdies (help 206) and SwingU (help 34) need the round started or cached with signal; Golfshot distances only (zendesk 360017868573); Hole19 synced courses |
| One group of up to 5 golfers, free | Free tiers vary | each app's free tier differs; see the price pages above |
| Price | up to $99.99/yr for the premium tier | the figure above |

Pages read: 18Birdies help articles 661, 552, 57, 772, 206, https://18birdies.com/aicoach ; SwingU help 24, 112, 34 and the App
Store listing; Golfshot free-vs-pro, zendesk 360021858093, 360017868573, 360019461034, /voice-assistant, blog 2025-08-21
(Golf Genius); Hole19 /premium, /intelligence, /features/live-play, winter-update 2025-12-15, App Store listing. Pages that
would not load (404/403), so nothing was claimed from them: 18Birdies help 96 and 520; Hole19 help 26051600319516,
15178598902940, 360009382434; golfshot.com/our-products; Golfshot's App Store listing.
