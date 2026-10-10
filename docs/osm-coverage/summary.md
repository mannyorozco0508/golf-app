# OSM golf coverage — summary

Data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright

Fetched 2026-10-09 (Phoenix and Washington greens and hole lines refreshed 2026-10-10; green relations counted by outer piece since 2026-10-10) from OpenStreetMap (Overpass, one area at a time). Per-area lists: [Phoenix metro, AZ](phoenix.md), [Washington](washington.md), [Oregon](oregon.md), [Connecticut](connecticut.md), [Florida](florida.md). The app reads the same rows from gps-coverage-<state>.js (tools/gps-osm-coverage.js).

- **All greens** = a mapped green for every hole (out of the course's `holes` tag when OSM has one, else 18; 27/36 when the hole numbers show it). **Partial** = some greens. **None** = outline only.
- **Bundle-ready** = all greens AND a hole line ending at every green — what tools/gps-import-osm.js needs to bundle a course.
- Practice / putting greens are not counted. Every leisure=golf_course outline is one row, so a club mapped twice (e.g. Camas Meadows) appears twice.

| Area | Courses | All greens | Partial | None | % all greens | Bundle-ready, not yet bundled |
|---|---|---|---|---|---|---|
| Phoenix metro, AZ | 198 | 91 | 55 | 52 | 46% | 74 |
| Washington | 268 | 139 | 62 | 67 | 52% | 113 |
| Oregon | 193 | 78 | 43 | 72 | 40% | 62 |
| Connecticut | 186 | 121 | 55 | 10 | 65% | 118 |
| Florida | 1964 | 411 | 362 | 1191 | 21% | 327 |
| **All five** | **2809** | **840** | **577** | **1392** | **30%** | **694** |

## Courses Manny plays

| Area | Course (OSM name, city) | Greens | Status |
|---|---|---|---|
| Phoenix metro, AZ | Dobson Ranch: Dobson Ranch Golf Course, Mesa | 18/18 | **bundled** |
| Phoenix metro, AZ | TPC Scottsdale: TPC Scottsdale Champions Course, Scottsdale | 18/18 | **bundled** |
| Phoenix metro, AZ | TPC Scottsdale: TPC Scottsdale Stadium Course, Scottsdale | 18/18 | **bundled** |
| Phoenix metro, AZ | Talking Stick: Talking Stick Golf Club, Scottsdale | 36/36 | **bundled** |
| Phoenix metro, AZ | We-Ko-Pa: We-Ko-Pa Golf Club, Fort McDowell | 10/18 | partial |
| Phoenix metro, AZ | Las Colinas: Las Colinas Golf Club, Queen Creek | 18/18 | **bundled** |
| Phoenix metro, AZ | Legacy: Legacy Golf Resort Phoenix, Phoenix | 18/18 | **bundled** |
| Washington | Tri-Mountain: Tri Mountain Golf Course, La Center | 18/18 | **bundled** |
| Washington | Camas Meadows: Camas Meadows, Camas | 18/18 | all greens, hole lines missing |
| Washington | Camas Meadows: Camas Meadows Golf Club, Camas | 2/18 | partial |
| Washington | Chambers Bay: Chambers Bay Golf Course, University Place | 18/18 | **bundled** |
| Washington | Lewis River: Lewis River Golf Course, Woodland | 18/18 | **bundled** |
| Washington | Mint Valley: Mint Valley Golf Course, Longview | 18/18 | **bundled** |
| Washington | Three Rivers: Three Rivers Golf Course, Kelso | 18/18 | **bundled** |
| Washington | Elk Ridge: Elk Ridge Golf Course, Carson | 13/18 | partial |
| Washington | Tahoma Valley: Tahoma Valley Golf and Country Club, Yelm | 18/18 | **bundled** |
| Washington | Allenmore: Allenmore Golf Course, Tacoma | 18/18 | **bundled** |
| Washington | Meadow Park: Meadow Park Golf Course, Tacoma | 18/18 | **bundled** |
| Oregon | Glendoveer: Glendoveer Golf Course, Maywood Park | 36/36 | **bundled** |
| Oregon | Indian Creek: Indian Creek Golf Course, Hood River | 18/18 | **bundled** |
| Oregon | Reserve Vineyards: The Reserve, Hillsboro | 18/18 | all greens, hole lines missing |
| Oregon | Stone Creek: Stone Creek Golf Club, Oregon City | 18/18 | **bundled** |
| Oregon | Wildwood: Wildwood Golf Course, Scappoose | 18/18 | **bundled** |
| Florida | Streamsong: Streamsong Resort - Black Course, Bowling Green | 18/18 | bundle-ready |
| Florida | Streamsong: Streamsong Resort - Red and Blue Courses, Bowling Green | 36/36 | **bundled** |

Notes (2026-10-10):
- **Bundled 2026-10-10:** TPC Scottsdale Champions, Talking Stick (O'odham and Piipaash), Legacy (Phoenix), Lewis River (17 of 18: hole 11's line ends 43 m short of its green), Mint Valley, Three Rivers, Tahoma Valley, Allenmore, Meadow Park (Championship 18), Glendoveer East and West, Indian Creek, Stone Creek, Wildwood, Streamsong Red, and Dobson Ranch (all 18, mapped by Manny 2026-10-09/10).
- **Streamsong Black and Blue** are bundle-ready in OSM but not in our course directory, so they have no course key to ship under yet. The badge shows them from this list, and the GPS side looks them up once when they are opened.
- **"(bundled)" marks the OSM outline.** Streamsong "Red and Blue" shows bundled because Red is.
- **Reserve Vineyards** is in OSM as "The Reserve" (Hillsboro), one outline for the 36-hole club. It has 40 greens (36 holes + practice) but only 1 hole line, so it is not bundle-ready.
- **Camas Meadows** has all 18 greens but 16 hole lines, 2 short of bundle-ready. A second, older outline ("Camas Meadows Golf Club") has 2 greens.
- **We-Ko-Pa** (10 of 18, one outline for both courses) and **Elk Ridge** (13 of 18) are partial.
- **Green relations (2026-10-10):** a golf=green mapped as a multipolygon now counts once per outer piece, and the app reads every piece (it used to read only the first outer member). Under that rule 2 courses gain holes: Twin Eagles (Bonita Springs, +6) and Pembroke Lakes (Pembroke Pines, +1). Lewis River 11 was the same case until it was redrawn as a simple area.
