# OSM golf coverage — summary

Data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright

Fetched 2026-10-09 from OpenStreetMap (Overpass, one area at a time, mail.ru mirror first). Per-area lists: [Phoenix metro, AZ](phoenix.md), [Washington](washington.md), [Oregon](oregon.md), [Connecticut](connecticut.md), [Florida](florida.md).

- **All greens** = a mapped green for every hole (out of the course's `holes` tag when OSM has one, else 18; 27/36 when the hole numbers show it). **Partial** = some greens. **None** = outline only.
- **Bundle-ready** = all greens AND a hole line ending at every green — what tools/gps-import-osm.js needs to bundle a course.
- Practice / putting greens are not counted. Every leisure=golf_course outline is one row, so a club mapped twice (e.g. Camas Meadows) appears twice.

| Area | Courses | All greens | Partial | None | % all greens | Bundle-ready (not yet bundled) |
|---|---|---|---|---|---|---|
| Phoenix metro, AZ | 198 | 89 | 57 | 52 | 45% | 76 |
| Washington | 268 | 134 | 67 | 67 | 50% | 114 |
| Oregon | 193 | 77 | 44 | 72 | 40% | 65 |
| Connecticut | 186 | 115 | 61 | 10 | 62% | 112 |
| Florida | 1964 | 407 | 366 | 1191 | 21% | 323 |
| **All five** | **2809** | **822** | **595** | **1392** | **29%** | **690** |

## Courses Manny plays

| Area | Course (OSM name, city) | Greens | Status |
|---|---|---|---|
| Phoenix metro, AZ | Dobson Ranch: Dobson Ranch Golf Course, Mesa | 1/18 | partial |
| Phoenix metro, AZ | TPC Scottsdale: TPC Scottsdale Champions Course, Scottsdale | 18/18 | **bundle-ready — bundle next** |
| Phoenix metro, AZ | TPC Scottsdale: TPC Scottsdale Stadium Course, Scottsdale | 18/18 | already bundled |
| Phoenix metro, AZ | Talking Stick: Talking Stick Golf Club, Scottsdale | 36/36 | **bundle-ready — bundle next** |
| Phoenix metro, AZ | We-Ko-Pa: We-Ko-Pa Golf Club, Fort McDowell | 10/18 | partial |
| Phoenix metro, AZ | Las Colinas: Las Colinas Golf Club, Queen Creek | 18/18 | already bundled |
| Phoenix metro, AZ | Legacy: Legacy Golf Resort Phoenix, Phoenix | 18/18 | **bundle-ready — bundle next** |
| Washington | Tri-Mountain: Tri Mountain Golf Course, La Center | 18/18 | already bundled |
| Washington | Camas Meadows: Camas Meadows, Camas | 18/18 | all greens, hole lines missing |
| Washington | Camas Meadows: Camas Meadows Golf Club, Camas | 2/18 | partial |
| Washington | Chambers Bay: Chambers Bay Golf Course, University Place | 18/18 | already bundled |
| Washington | Lewis River: Lewis River Golf Course, Woodland | 18/18 | **bundle-ready — bundle next** |
| Washington | Mint Valley: Mint Valley Golf Course, Longview | 18/18 | **bundle-ready — bundle next** |
| Washington | Three Rivers: Three Rivers Golf Course, Kelso | 18/18 | **bundle-ready — bundle next** |
| Washington | Elk Ridge: Elk Ridge Golf Course, Carson | 13/18 | partial |
| Washington | Tahoma Valley: Tahoma Valley Golf and Country Club, Yelm | 18/18 | **bundle-ready — bundle next** |
| Washington | Allenmore: Allenmore Golf Course, Tacoma | 18/18 | **bundle-ready — bundle next** |
| Washington | Meadow Park: Meadow Park Golf Course, Tacoma | 18/18 | **bundle-ready — bundle next** |
| Oregon | Glendoveer: Glendoveer Golf Course, Maywood Park | 36/36 | **bundle-ready — bundle next** |
| Oregon | Indian Creek: Indian Creek Golf Course, Hood River | 18/18 | **bundle-ready — bundle next** |
| Oregon | Reserve Vineyards: The Reserve, Hillsboro | 18/18 | all greens, hole lines missing |
| Oregon | Stone Creek: Stone Creek Golf Club, Oregon City | 18/18 | **bundle-ready — bundle next** |
| Oregon | Wildwood: Wildwood Golf Course, Scappoose | 18/18 | **bundle-ready — bundle next** |
| Florida | Streamsong: Streamsong Resort - Black Course, Bowling Green | 18/18 | **bundle-ready — bundle next** |
| Florida | Streamsong: Streamsong Resort - Red and Blue Courses, Bowling Green | 36/36 | **bundle-ready — bundle next** |

## Bundle next

Your courses that are bundle-ready and not yet in the app: TPC Scottsdale Champions Course (Scottsdale); Talking Stick Golf Club (Scottsdale); Legacy Golf Resort Phoenix (Phoenix); Lewis River Golf Course (Woodland); Mint Valley Golf Course (Longview); Three Rivers Golf Course (Kelso); Tahoma Valley Golf and Country Club (Yelm); Allenmore Golf Course (Tacoma); Meadow Park Golf Course (Tacoma); Glendoveer Golf Course (Maywood Park); Indian Creek Golf Course (Hood River); Stone Creek Golf Club (Oregon City); Wildwood Golf Course (Scappoose); Streamsong Resort - Black Course (Bowling Green); Streamsong Resort - Red and Blue Courses (Bowling Green).

Notes:
- **Reserve Vineyards** is in OSM as "The Reserve" (Hillsboro), one outline for the 36-hole club. It has 40 greens (36 holes + practice) but only 1 hole line, so it is counted out of 18 and is not bundle-ready. Someone has to add the hole lines in OSM first.
- **Camas Meadows** has all 18 greens but 16 hole lines; it is 2 lines short of bundle-ready. A second, older outline ("Camas Meadows Golf Club") has 2 greens.
- Dobson Ranch (1 green) and We-Ko-Pa (10 of 18, one outline for both courses) are partial. Elk Ridge has 13 of 18.
