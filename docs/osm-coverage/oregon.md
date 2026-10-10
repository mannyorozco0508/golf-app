# OSM golf coverage — Oregon

Data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright

Fetched 2026-10-10 from OpenStreetMap (Overpass). 193 courses: every leisure=golf_course outline is one row, so a 27/36-hole club mapped as separate courses counts once per course.

- **Greens** = holes with a green: golf=green areas inside (or within 250 m of) the course, practice / putting greens left out, never fewer than the holes whose line ends on a green (a double green serves two holes), capped at the hole count.
- **Hole count** = the course's `holes` tag when OSM has one, else 18 (more when its hole lines go past 18). A 9-hole course with no `holes` tag is measured out of 18.
- **ALL GREENS** = a green for every hole. **PARTIAL** = some. **NONE** = outline only.
- **Bundle-ready** = all greens AND every hole has a hole line (golf=hole) ending at its green - what tools/gps-import-osm.js needs to bundle a course. **(bundled)** = already in the app.
- City = the course's addr:city, else the nearest town in OSM. ★ = a course Manny plays.

**Summary:** 193 courses — all greens 78, partial 43, none 72 (40% with all greens). Bundle-ready, not yet bundled: 62.

## ALL GREENS (78)

| City | Course | Greens | Hole lines ending at a green | Tees | OSM |
|---|---|---|---|---|---|
| Albany | (unnamed) — bundle-ready | 18/18 | 18/18 | 18/18 | w741537980 |
| Albany | Albany Golf Course — bundle-ready | 18/18 | 18/18 | 0/18 | w129296323 |
| Altamont | Shield Crest Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w424977162 |
| Bandon | Bandon Dunes Golf Resort — bundle-ready | 36/36 | 36/36 | 36/36 | w362513477 |
| Bandon | Bandon Sheep Ranch — bundle-ready | 18/18 | 18/18 | 5/18 | w823626858 |
| Bandon | Bandon Trails — bundle-ready | 18/18 | 18/18 | 18/18 | w362513476 |
| Bay City | Alderbrook Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w551487869 |
| Beaverton | Portland Golf Club — bundle-ready | 18/18 | 18/18 | 10/18 | w155831835 |
| Beaverton | RedTail Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w156976873 |
| Bend | Bend Golf & Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | w356701386 |
| Bend | Lost Tracks Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w356701380 |
| Bend | Tetherow Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | w780645556 |
| Bend | Widgi Creek Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r7948882 |
| Blue River | Tokatee Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | w331173622 |
| Brookings | Salmon Run Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w1292890177 |
| Canby | Willamette Valley Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | w146072029 |
| Coos Bay | Coos Golf Club — bundle-ready | 18/18 | 18/18 | 0/18 | w670785945 |
| Cornelius | Forest Hills Golf Course | 18/18 | 17/18 | 18/18 | w143653936 |
| Corvallis | Corvallis Country Club | 18/18 | 17/18 | 17/18 | w331422337 |
| Corvallis | Trysting Tree Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | w98522582 |
| Creswell | Emerald Valley Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w202067972 |
| Crooked River Ranch | Crooked River Ranch Golf Course — bundle-ready | 18/18 | 18/18 | 0/18 | w438867105 |
| Durham | Tualatin Country Club | 18/18 | 0/18 | 0/18 | w146982317 |
| Eagle Point | Eagle Point Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | r4455118 |
| Eagle Point | Stone Ridge Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | w320239984 |
| Eugene | Eugene Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | w124953002 |
| Eugene | Fiddler's Green Golf Center — bundle-ready | 18/18 | 18/18 | 18/18 | w461506169 |
| Eugene | Oakway Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r12932854 |
| Florence | Sandpines Golf Link — bundle-ready | 18/18 | 18/18 | 17/18 | w304892693 |
| Gearhart | Gearhart Golf Links — bundle-ready | 18/18 | 18/18 | 18/18 | w158904851 |
| Gleneden Beach | Salishan Golf Links — bundle-ready | 18/18 | 18/18 | 18/18 | w1049137675 |
| Gold Beach | (unnamed) — bundle-ready | 18/18 | 18/18 | 18/18 | w917752383 |
| Grants Pass | Grants Pass Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | w283193506 |
| Gresham | Gresham Golf and Country Club | 18/18 | 0/18 | 0/18 | w142301466 |
| Gresham | Persimmon Country Club — bundle-ready | 18/18 | 18/18 | 17/18 | w142411196 |
| Helvetia | Rock Creek Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | w157151317 |
| Hillsboro | Meriwether National Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w153474835 |
| Hillsboro | **The Reserve** ★ | 18/18 | 1/18 | 1/18 | w136348508 |
| Hood River | (unnamed) | 18/18 | 9/18 | 9/18 | w1255781856 |
| Hood River | **Indian Creek Golf Course** ★ (bundled) | 18/18 | 18/18 | 18/18 | w276425283 |
| Johnson City | Sah-hah-lee Golf Course | 18/18 | 0/18 | 0/18 | w131635984 |
| Junction City | Shadow HIlls Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | w216857843 |
| Keizer | McNary Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | r13030479 |
| Klamath Falls | Harbor Links Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r14919901 |
| La Pine | Quail Run Golf Course — bundle-ready | 18/18 | 18/18 | 0/18 | w355573237 |
| Lake Oswego | Oswego Lake Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | w55682263 |
| Lyons | Elkhorn Valley Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w635013286 |
| Maywood Park | **Glendoveer Golf Course** ★ (bundled) | 36/36 | 36/36 | 36/36 | w39789766 |
| Maywood Park | Rose City Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r6549434 |
| Medford | Centennial Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | w296591780 |
| Medford | Rogue Valley Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | r3944986 |
| Milwaukie | Eastmoreland Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r11095178 |
| Monroe | Diamond Woods Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w392872316 |
| Myrtle Creek | Cougar Canyon Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w552755491 |
| Newberg | Chehalem Glenn Golf Course | 18/18 | 0/18 | 0/18 | r14595730 |
| North Plains | Pumpkin Ridge Golf Club — bundle-ready | 36/36 | 36/36 | 36/36 | w901988733 |
| Oregon City | Oregon Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | r11815308 |
| Oregon City | **Stone Creek Golf Club** ★ (bundled) | 18/18 | 18/18 | 18/18 | w188382554 |
| Portland | Columbia Edgewater Country Club — bundle-ready | 18/18 | 18/18 | 18/18 | w96855100 |
| Portland | Heron Lakes Great Blue — bundle-ready | 18/18 | 18/18 | 18/18 | r21058472 |
| Portland | Heron Lakes Greenback — bundle-ready | 18/18 | 18/18 | 18/18 | r21058473 |
| Prineville | Meadow Lakes Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w202624709 |
| Redmond | Eagle Crest Ridge Course — bundle-ready | 18/18 | 18/18 | 0/18 | w1518797803 |
| Redmond | Juniper Golf Course — bundle-ready | 18/18 | 18/18 | 0/18 | w533468821 |
| Salem | Salem Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | w260668748 |
| Scappoose | **Wildwood Golf Course** ★ (bundled) | 18/18 | 18/18 | 18/18 | w428675780 |
| Seneca | Silvies Ranch — bundle-ready | 18/18 | 18/18 | 0/18 | w904342362 |
| Sisters | Aspen Lakes Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | w842299502 |
| Sisters | Big Meadow Golf Course | 18/18 | 0/18 | 0/18 | r8004002 |
| Sisters | Glaze Meadow Golf Course — bundle-ready | 18/18 | 18/18 | 3/18 | r8004001 |
| Sublimity | (unnamed) | 18/18 | 0/18 | 0/18 | w180624782 |
| Sunriver | Crosswater Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r14236725 |
| Sunriver | Meadows Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r5299743 |
| Sunriver | Woodlands Golf Course — bundle-ready | 18/18 | 18/18 | 18/18 | r5301309 |
| Turner | Creekside Golf Club — bundle-ready | 18/18 | 18/18 | 18/18 | r16502503 |
| Warrenton | Astoria Golf & Country Club | 18/18 | 0/18 | 0/18 | w285375235 |
| Waterloo | (unnamed) — bundle-ready | 18/18 | 18/18 | 18/18 | w745491408 |
| Wood Village | The Pub Courses at Edgefield | 27/27 | 20/27 | 0/27 | w431590846 |

## PARTIAL (43)

| City | Course | Greens | Hole lines ending at a green | Tees | OSM |
|---|---|---|---|---|---|
| Ashland | Oak Knoll Golf Course | 11/18 | 0/18 | 0/18 | w320860969 |
| Baker City | Baker City Golf Club | 2/18 | 0/18 | 0/18 | w148067474 |
| Bandon | Bandon Preserve | 14/18 | 13/18 | 6/18 | w674855473 |
| Bandon | Practice Center | 1/18 | 0/18 | 0/18 | w362513478 |
| Bandon | Shortys | 19/27 | 19/27 | 19/27 | w1540940976 |
| Bend | Old Back Nine Golf Club | 9/18 | 9/18 | 9/18 | r12705143 |
| Boring | Greenlea Golf Course | 9/18 | 9/18 | 9/18 | w184099485 |
| Boring | Mountain View Golf Course | 16/18 | 0/18 | 0/18 | w184099489 |
| Canby | Sandelie Golf Course | 1/18 | 0/18 | 0/18 | w146080264 |
| Coos Bay | Sunset Bay Golf Course | 12/18 | 12/18 | 0/18 | w892462106 |
| Dallas | (unnamed) | 9/18 | 9/18 | 9/18 | w1137374461 |
| Dallas | Cross Creek Golf Course | 4/18 | 4/18 | 4/18 | w738065456 |
| Eugene | Laurelwood Golf Course | 13/18 | 9/18 | 9/18 | w215481121 |
| Forest Grove | Sunset Grove Golf Club | 9/18 | 0/18 | 0/18 | w143621082 |
| Hillsboro | Killarney West Golf Course | 9/18 | 0/18 | 0/18 | w153436538 |
| Hillsboro | McKay Creek Golf Course | 12/18 | 9/18 | 9/18 | w153436531 |
| Island City | La Grande Country Club | 8/18 | 0/18 | 0/18 | w469780293 |
| John Day | John Day Golf Club | 9/18 | 8/18 | 9/18 | w394254357 |
| Keizer | (unnamed) | 7/18 | 0/18 | 0/18 | r17908305 |
| Keizer | Salemtowne Golf Course | 3/18 | 0/18 | 0/18 | r17908306 |
| Lincoln City | Chinook Winds Golf Resort | 16/18 | 0/18 | 0/18 | r10405659 |
| Medford | Bear Creek Golf Course | 10/18 | 0/18 | 0/18 | w296591779 |
| Medford | Quail Point Golf Course | 9/18 | 0/18 | 0/18 | w296591781 |
| Medford | Stewart Meadows Golf Course | 10/18 | 9/18 | 9/18 | w177179968 |
| Mount Angel | (unnamed) | 8/18 | 0/18 | 0/18 | w733118350 |
| Neskowin | Neskowin Beach Golf Course | 9/18 | 9/18 | 4/18 | w182216217 |
| Oakridge | (unnamed) | 10/18 | 9/18 | 9/18 | w358568496 |
| Paisley | Christmas Valley Golf Course | 10/18 | 9/18 | 9/18 | w199007238 |
| Pendleton | Wildhorse Golf Course | 3/18 | 2/18 | 2/18 | w514900744 |
| Portland | Claremont Golf Club | 9/18 | 9/18 | 9/18 | r11271172 |
| Portland | Colwood Golf Center | 1/18 | 0/18 | 0/18 | w751364558 |
| Portland | Heron Lakes Golf Club | 3/18 | 0/18 | 0/18 | r21058474 |
| Portland | Riverside Golf and Country Club | 8/18 | 8/18 | 10/18 | w96855094 |
| Redmond | (unnamed) | 1/18 | 1/18 | 1/18 | w516918774 |
| Redmond | (unnamed) | 1/18 | 1/18 | 1/18 | w516918777 |
| Redmond | (unnamed) | 1/18 | 1/18 | 1/18 | w516918780 |
| Redmond | (unnamed) | 3/18 | 0/18 | 2/18 | w1396597505 |
| Redmond | The Resort Course At Eagle Crest | 16/18 | 15/18 | 11/18 | w516918775 |
| Sunriver | (unnamed) | 1/18 | 0/18 | 0/18 | w206867342 |
| Sunriver | (unnamed) | 1/18 | 0/18 | 0/18 | w206867344 |
| Sunriver | Caldera Links Golf Course | 10/18 | 9/18 | 9/18 | w206867343 |
| Wilsonville | Charbonneau Golf Course | 1/18 | 0/18 | 0/18 | r12760592 |
| Winchester | Roseburg Country Club | 2/18 | 2/18 | 2/18 | w283724683 |

## NONE (outline only) (72)

| City | Course | Greens | Hole lines ending at a green | Tees | OSM |
|---|---|---|---|---|---|
| Arlington | China Creek Golf Course | 0/18 | 0/18 | 0/18 | w685109668 |
| Astoria | Lewis & Clark Golf Course | 0/18 | 0/18 | 0/18 | w820248052 |
| Bandon | (unnamed) | 0/18 | 0/18 | 0/18 | w160566001 |
| Beaverton | Claremont Greens | 0/18 | 0/18 | 0/18 | w157133759 |
| Bend | (unnamed) | 0/18 | 0/18 | 0/18 | w1056725973 |
| Bend | (unnamed) | 0/18 | 0/18 | 0/18 | w1056725975 |
| Bend | (unnamed) | 0/18 | 0/18 | 0/18 | w1056725976 |
| Bend | River's Edge Golf Course | 0/18 | 0/18 | 0/18 | w818894228 |
| Cave Junction | Illinois Valley Golf Club | 0/18 | 0/18 | 0/18 | w296591768 |
| Chenoweth | The Dalles Country Club | 0/18 | 0/18 | 0/18 | w270761370 |
| Corvallis | (unnamed) | 0/18 | 0/18 | 0/18 | w1147460359 |
| Cottage Grove | Hidden Valley Golf Course | 0/18 | 0/18 | 0/18 | w202037434 |
| Cottage Grove | Middlefield Golf Course | 0/18 | 0/18 | 0/18 | r13470785 |
| Echo | Echo City Golf Course | 0/18 | 0/18 | 0/18 | r7423591 |
| Enterprise | Alpine Meadows Golf Course | 0/18 | 0/18 | 0/18 | w314515644 |
| Estacada | Springwater Golf Course | 0/18 | 0/18 | 0/18 | w296591782 |
| Eugene | Highway 58 Golf | 0/18 | 0/18 | 0/18 | w1260419888 |
| Florence | Ocean Dunes Golf Links | 0/18 | 0/18 | 0/18 | w1203860829 |
| Gearhart | (unnamed) | 0/18 | 0/18 | 0/18 | w1539563205 |
| Gearhart | (unnamed) | 0/18 | 0/18 | 0/18 | w1539596594 |
| Gladstone | Rivergreens Golf Club | 0/18 | 0/18 | 0/18 | w187257806 |
| Gladstone | Trails End Golf Center | 0/18 | 0/18 | 0/18 | w561936321 |
| Grants Pass | Red Mountain Golf Course | 0/18 | 0/18 | 0/18 | w318802782 |
| Heppner | Willow Creek Country Club | 0/18 | 0/18 | 0/18 | w468998043 |
| Hines | Valley Golf Club | 0/18 | 0/18 | 0/18 | w215251563 |
| Independence | (unnamed) | 0/18 | 0/18 | 0/18 | w183193453 |
| Johnson City | Eagle Landing Golf Course | 0/18 | 0/18 | 0/18 | w743763704 |
| King City | King City Golf Course | 0/18 | 0/18 | 0/18 | r12885610 |
| King City | Summerfield Golf Course | 0/18 | 0/18 | 0/18 | r12885611 |
| Klamath Falls | Reames Golf and Country Club | 0/18 | 0/18 | 0/18 | w193282296 |
| Klamath Falls | Round Lake Golf Course | 0/18 | 0/18 | 0/18 | w419046678 |
| Lake Oswego | Lake Oswego Golf Course | 0/18 | 0/18 | 0/18 | w60087783 |
| Lakeview | Mark Clark Golf Course | 0/18 | 0/18 | 0/18 | w597841119 |
| Lincoln City | (unnamed) | 0/18 | 0/18 | 0/18 | r14139994 |
| Madras | Desert Peaks Golf Course | 0/18 | 0/18 | 0/18 | w438313039 |
| Manzanita | Manzanita Golf Course | 0/18 | 0/18 | 0/18 | r7082455 |
| Marcola | (unnamed) | 0/18 | 0/18 | 0/18 | w521926548 |
| McMinnville | Bayou Golf Club | 0/18 | 0/18 | 0/18 | r14044578 |
| McMinnville | Michelbook Country Club | 0/18 | 0/18 | 0/18 | w551185268 |
| Milton-Freewater | Milton-Freewater Municipal Golf Course | 0/18 | 0/18 | 0/18 | w185819002 |
| Milwaukie | Waverly Country Club | 0/18 | 0/18 | 0/18 | w96457214 |
| Molalla | (unnamed) | 0/18 | 0/18 | 0/18 | w1449939178 |
| Molalla | Arrowhead Golf Club | 0/18 | 0/18 | 0/18 | w111668220 |
| Myrtle Point | Amaze Zing Golf | 0/18 | 0/18 | 0/18 | w492879856 |
| Newport | Agate Beach Golf Course | 0/18 | 0/18 | 0/18 | w651851559 |
| Oregon City | Oregon City Golf Club | 0/18 | 0/18 | 0/18 | w130808510 |
| Pilot Rock | Pendleton Country Club | 0/18 | 0/18 | 0/18 | w415831919 |
| Prineville | Prineville Golf and Country Clup | 0/18 | 0/18 | 0/18 | w430079112 |
| Redmond | (unnamed) | 0/18 | 0/18 | 0/18 | w320289924 |
| Redmond | The Greens at Redmond | 0/18 | 0/18 | 0/18 | w320236405 |
| Redmond | The Greens at Redmond | 0/18 | 0/18 | 0/18 | w320236407 |
| Redmond | The Greens at Redmond | 0/18 | 0/18 | 0/18 | w320236409 |
| Redmond | The Shed | 0/18 | 0/18 | 0/18 | w1396597200 |
| Reedsport | Forest Hills Country Club | 0/18 | 0/18 | 0/18 | w464029035 |
| Roseburg | Stewart Park Golf Course | 0/18 | 0/18 | 0/18 | w459178689 |
| Salem | Illahe Hills Country Club | 0/18 | 0/18 | 0/18 | w181916216 |
| Salem | Meadowlawn Golf Course | 0/18 | 0/18 | 0/18 | r3944985 |
| Seaside | Seaside Golf Club | 0/18 | 0/18 | 0/18 | r21164108 |
| Sutherlin | Umpqua Golf Resort | 0/18 | 0/18 | 0/18 | w201879086 |
| Umatilla | (unnamed) | 0/18 | 0/18 | 0/18 | w1446407602 |
| Umatilla | Big River Golf Course | 0/18 | 0/18 | 0/18 | w362608172 |
| Union | Buffalo Peak Golf Course | 0/18 | 0/18 | 0/18 | w512168089 |
| Vernonia | Vernonia Golf Course | 0/18 | 0/18 | 0/18 | w260744563 |
| Waldport | Crestview Golf Club | 0/18 | 0/18 | 0/18 | w463497105 |
| Warm Springs | (unnamed) | 0/18 | 0/18 | 0/18 | w751745796 |
| Welches | The Courses | 0/18 | 0/18 | 0/18 | r3944988 |
| White City | (unnamed) | 0/18 | 0/18 | 0/18 | w459096023 |
| Wilsonville | Langdon Farms Golf Course | 0/18 | 0/18 | 0/18 | w30516492 |
| Wilsonville | Langdon Farms Golf Course | 0/18 | 0/18 | 0/18 | w30516571 |
| Woodburn | (unnamed) | 0/18 | 0/18 | 0/18 | w429119521 |
| Woodburn | OGA Golf Course | 0/18 | 0/18 | 0/18 | r6430131 |
| Woodburn | Woodburn Golf Course | 0/18 | 0/18 | 0/18 | r6428385 |
