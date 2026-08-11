// ============================================================================
// GolfApp — Shared Course Database
// Used by admin.html (round setup) and trip.html (trip-wide round builder), so
// both pages always search and reference the exact same course list. Loaded
// via <script src="course-data.js"> — plain data + portable helper functions,
// no DOM references, since admin.html and trip.html each wire their own UI to it.
//
// courseDirectory: the full searchable list (~150 courses) shown in course
//   pickers, grouped by region. Most entries here don't have local hole data —
//   their real par/handicap data lives in Firebase's global_courses node,
//   fetched live by whichever page needs it.
// coursePresets: local seed data for a smaller set of courses (mostly Myrtle
//   Beach + a few others), used as a fallback/default before Firebase data
//   exists for a course, or when global_courses hasn't loaded yet.
// nineHoleLoops: special-case modular-nine courses (e.g. Thistle's three
//   interchangeable 9-hole loops) that combine into an 18-hole round.
// ============================================================================

    const courseDirectory = [
        { group: "🌲 SW Washington, Gorge & Portland (Camas Area)", items: [
            { id: "swwa_camasmeadows", name: "Camas Meadows Golf Club" },
            { id: "swwa_trimountain", name: "Tri-Mountain Golf Course" },
            { id: "swwa_lewisriver", name: "Lewis River Golf Course" },
            { id: "swwa_mintvalley", name: "Mint Valley Golf Course" },
            { id: "swwa_threerivers", name: "Three Rivers Golf Course" },
            { id: "swwa_elkridge", name: "Elk Ridge Golf Course" },
            { id: "swwa_tahoma_valley", name: "Tahoma Valley Golf Course (Yelm)" },
            { id: "swwa_skamania", name: "Skamania Lodge Golf Course" },
            { id: "swwa_beaconrock", name: "Beacon Rock Golf Course" },
            { id: "swwa_cedars", name: "The Cedars at Salmon Creek" },
            { id: "swwa_fairwayvillage", name: "Fairway Village Golf Course" },
            { id: "swwa_orchardhills", name: "Orchard Hills Country Club" },
            { id: "swwa_royaloaks", name: "Royal Oaks Country Club" },
            { id: "or_indiancreek", name: "Indian Creek Golf Course (Hood River)" },
            { id: "or_hoodriver", name: "Hood River Golf Course" },
            { id: "or_stonecreek", name: "Stone Creek Golf Club (Oregon City)" },
            { id: "or_wildwood", name: "Wildwood Golf Course" },
            { id: "or_glendoveer_east", name: "Glendoveer Golf Course (East)" },
            { id: "or_glendoveer_west", name: "Glendoveer Golf Course (West)" },
            { id: "or_heronlakes_blue", name: "Heron Lakes (Great Blue)" },
            { id: "or_heronlakes_greenback", name: "Heron Lakes (Greenback)" },
            { id: "or_broadmoor_pdx", name: "Broadmoor Golf Course (Portland)" },
            { id: "or_colwood", name: "Colwood Golf Center" },
            { id: "or_rosecity", name: "Rose City Golf Course" },
            { id: "or_eastmoreland", name: "Eastmoreland Golf Course" },
            { id: "or_columbiaedgewater", name: "Columbia Edgewater Country Club" },
            { id: "or_riverside", name: "Riverside Golf & Country Club" },
            { id: "or_pumpkin_ghost", name: "Pumpkin Ridge (Ghost Creek)" },
            { id: "or_pumpkin_witch", name: "Pumpkin Ridge (Witch Hollow)" },
            { id: "or_langdonfarms", name: "Langdon Farms Golf Club" },
            { id: "or_reserve_north", name: "The Reserve Vineyards (North)" },
            { id: "or_reserve_south", name: "The Reserve Vineyards (South)" },
            { id: "or_ogagolf", name: "OGA Golf Course (Woodburn)" },
            { id: "or_chehalem", name: "Chehalem Glenn Golf Course" },
            { id: "or_redtail", name: "RedTail Golf Center" },
            { id: "or_oregoncitygc", name: "Oregon City Golf Club" },
            { id: "or_waverley", name: "Waverley Country Club" },
            { id: "or_portlandgc", name: "Portland Golf Club" },
            { id: "or_tualatincc", name: "Tualatin Country Club" },
            { id: "or_meriwether", name: "Meriwether National Golf Club" },
            { id: "or_quailvalley", name: "Quail Valley Golf Course" },
            { id: "or_mtview_boring", name: "Mountain View Golf Course (Boring)" }
        ]},
        { group: "🏖️ Myrtle Beach Trip", items: [
            { id: "caledonia", name: "Caledonia Golf & Fish Club" },
            { id: "trueblue", name: "True Blue Golf Club" },
            { id: "pinelakes", name: "Pine Lakes Country Club" },
            { id: "pinehills", name: "Myrtlewood - Pine Hills" },
            { id: "thistle_27", name: "Thistle Golf Club (NC - 27 Hole)" },
            { id: "prestwick", name: "Prestwick Country Club" },
            { id: "manofwar", name: "Man O' War Golf Club" }
        ]},
        { group: "🌵 Arizona (Phoenix / Scottsdale)", items: [
            { id: "az_tpc_stadium", name: "TPC Scottsdale (Stadium)" },
            { id: "az_tpc_champions", name: "TPC Scottsdale (Champions)" },
            { id: "az_troon_monument", name: "Troon North (Monument)" },
            { id: "az_troon_pinnacle", name: "Troon North (Pinnacle)" },
            { id: "az_wekopa_cholla", name: "We-Ko-Pa (Cholla)" },
            { id: "az_wekopa_saguaro", name: "We-Ko-Pa (Saguaro)" },
            { id: "az_grayhawk_raptor", name: "Grayhawk (Raptor)" },
            { id: "az_grayhawk_talon", name: "Grayhawk (Talon)" },
            { id: "az_papago", name: "Papago Golf Club" },
            { id: "az_talking_oodham", name: "Talking Stick Golf Club (O'odham)" },
            { id: "az_talking_piipaash", name: "Talking Stick Golf Club (Piipaash)" },
            { id: "az_quintero", name: "Quintero Golf Club" },
            { id: "az_camelback_ambiente", name: "Camelback (Ambiente)" },
            { id: "az_camelback_padre", name: "Camelback (Padre)" },
            { id: "az_boulders_north", name: "The Boulders (North)" },
            { id: "az_boulders_south", name: "The Boulders (South)" },
            { id: "az_wickenburg", name: "Wickenburg Ranch" },
            { id: "az_akchin", name: "Ak-Chin Southern Dunes" },
            { id: "az_raven", name: "Raven Golf Club" },
            { id: "az_goldcanyon_dinosaur", name: "Gold Canyon (Dinosaur Mountain)" },
            { id: "az_goldcanyon_sidewinder", name: "Gold Canyon (Sidewinder)" },
            { id: "az_starfire", name: "Starfire Golf Club" },
            { id: "az_mccormick_palm", name: "McCormick Ranch (Palm)" },
            { id: "az_mccormick_pine", name: "McCormick Ranch (Pine)" },
            { id: "az_biltmore_adobe", name: "Arizona Biltmore (Adobe)" },
            { id: "az_biltmore_links", name: "Arizona Biltmore (Links)" },
            { id: "az_wildfire_palmer", name: "Wildfire (Palmer)" },
            { id: "az_wildfire_faldo", name: "Wildfire (Faldo)" },
            { id: "az_phoenician", name: "The Phoenician" },
            { id: "az_superstition", name: "Superstition Mountain" }
        ]},
        { group: "🌲 Washington (Seattle / Tacoma Top 50)", items: [
            { id: "wa_chambers", name: "Chambers Bay" },
            { id: "wa_gold_olympic", name: "Gold Mountain (Olympic)" },
            { id: "wa_gold_cascade", name: "Gold Mountain (Cascade)" },
            { id: "wa_homecourse", name: "The Home Course" },
            { id: "wa_salish", name: "Salish Cliffs" },
            { id: "wa_newcastle_coal", name: "Newcastle (Coal Creek)" },
            { id: "wa_newcastle_china", name: "Newcastle (China Creek)" },
            { id: "wa_wanational", name: "Washington National" },
            { id: "wa_tpc_snoqualmie", name: "TPC Snoqualmie Ridge" },
            { id: "wa_sahalee", name: "Sahalee Country Club" },
            { id: "wa_broadmoor", name: "Broadmoor Golf Club" },
            { id: "wa_seattle_gc", name: "Seattle Golf Club" },
            { id: "wa_meridian", name: "Meridian Valley Country Club" },
            { id: "wa_tacoma_cgc", name: "Tacoma Country & Golf Club" },
            { id: "wa_redmond_ridge", name: "The Golf Club at Redmond Ridge" },
            { id: "wa_harbour_pointe", name: "Harbour Pointe Golf Club" },
            { id: "wa_druids_glen", name: "Druids Glen" },
            { id: "wa_port_ludlow", name: "Port Ludlow" },
            { id: "wa_white_horse", name: "White Horse Golf Club" },
            { id: "wa_jefferson_park", name: "Jefferson Park" },
            { id: "wa_west_seattle", name: "West Seattle Golf Course" },
            { id: "wa_jackson_park", name: "Jackson Park" },
            { id: "wa_interbay", name: "Interbay Golf Center" },
            { id: "wa_foster", name: "Foster Golf Links" },
            { id: "wa_high_cedars", name: "High Cedars Golf Club" },
            { id: "wa_madrona", name: "Madrona Links" },
            { id: "wa_spanaway", name: "Lake Spanaway" },
            { id: "wa_meadow_park", name: "Meadow Park" },
            { id: "wa_oakbrook", name: "Oakbrook Golf Club" },
            { id: "wa_allenmore", name: "Allenmore Golf Course" },
            { id: "wa_riverbend", name: "Riverbend Golf Complex" },
            { id: "wa_maplewood", name: "Maplewood Golf Course" },
            { id: "wa_cedarcrest", name: "Cedarcrest Golf Course" },
            { id: "wa_eaglemont", name: "Eaglemont Golf Course" },
            { id: "wa_semiahmoo", name: "Semiahmoo" },
            { id: "wa_loomis", name: "Loomis Trail" },
            { id: "wa_bellingham_gcc", name: "Bellingham G&CC" },
            { id: "wa_north_bellingham", name: "North Bellingham" },
            { id: "wa_twin_lakes", name: "Twin Lakes G&CC" },
            { id: "wa_enumclaw", name: "Enumclaw Golf Course" },
            { id: "wa_twin_rivers", name: "Twin Rivers" },
            { id: "wa_mount_si", name: "Mount Si Golf Course" },
            { id: "wa_snohomish", name: "Snohomish Golf Course" },
            { id: "wa_willows_coyote", name: "Willows Run (Coyote Creek)" },
            { id: "wa_willows_eagle", name: "Willows Run (Eagle's Talon)" },
            { id: "wa_bellevue", name: "Bellevue Golf Course" },
            { id: "wa_overlake", name: "Overlake G&CC" },
            { id: "wa_fairwood", name: "Fairwood G&CC" },
            { id: "eaglespride_redblue", name: "Eagle's Pride (Red/Blue)" },
            { id: "eaglespride_redgreen", name: "Eagle's Pride (Red/Green)" }
        ]},
        { group: "🌴 Florida (Miami / Hollywood)", items: [
            { id: "emerald_hills", name: "The Club at Emerald Hills" },
            { id: "hollywood_beach", name: "Hollywood Beach Golf Club" }
        ]},
        { group: "🌲 Connecticut / Local (Milford Area)", items: [
            { id: "oaklane", name: "Tradition at Oak Lane" },
            { id: "orangehills", name: "Orange Hills Country Club" },
            { id: "grassyhill", name: "Grassy Hill Country Club" },
            { id: "greatriver", name: "Great River Golf Club" },
            { id: "yale", name: "The Course at Yale" },
            { id: "millriver", name: "Mill River Country Club" },
            { id: "fairchild_black", name: "Fairchild Wheeler - Black" },
            { id: "fairchild_red", name: "Fairchild Wheeler - Red" },
            { id: "tashuaknolls", name: "Tashua Knolls Golf Course" },
            { id: "whitneyfarms", name: "Whitney Farms Golf Course" }
        ]}
    ];

    const nineHoleLoops = {
        thistle_27: {
            cameron: { name: "Cameron Nine (Par 36)", data: [{par:4,hcp:7},{par:4,hcp:4},{par:4,hcp:5},{par:3,hcp:8},{par:5,hcp:3},{par:4,hcp:6},{par:4,hcp:2},{par:3,hcp:9},{par:5,hcp:1}] },
            mackay: { name: "MacKay Nine (Par 36)", data: [{par:4,hcp:4},{par:4,hcp:5},{par:3,hcp:9},{par:4,hcp:7},{par:4,hcp:3},{par:3,hcp:8},{par:5,hcp:1},{par:4,hcp:6},{par:5,hcp:2}] },
            stewart: { name: "Stewart Nine (Par 35)", data: [{par:4,hcp:9},{par:4,hcp:7},{par:3,hcp:6},{par:5,hcp:2},{par:3,hcp:8},{par:5,hcp:5},{par:4,hcp:1},{par:4,hcp:3},{par:3,hcp:4}] }
        }
    };

    const coursePresets = {
        caledonia: { name: "Caledonia Golf & Fish Club", data: [{hole:1,par:4,hcpIndex:12},{hole:2,par:5,hcpIndex:8},{hole:3,par:3,hcpIndex:14},{hole:4,par:4,hcpIndex:6},{hole:5,par:4,hcpIndex:2},{hole:6,par:3,hcpIndex:16},{hole:7,par:4,hcpIndex:4},{hole:8,par:5,hcpIndex:10},{hole:9,par:3,hcpIndex:18},{hole:10,par:5,hcpIndex:15},{hole:11,par:3,hcpIndex:13},{hole:12,par:4,hcpIndex:9},{hole:13,par:4,hcpIndex:5},{hole:14,par:4,hcpIndex:7},{hole:15,par:4,hcpIndex:3},{hole:16,par:4,hcpIndex:1},{hole:17,par:3,hcpIndex:17},{hole:18,par:4,hcpIndex:11}] },
        trueblue: { name: "True Blue Golf Club", data: [{hole:1,par:5,hcpIndex:1},{hole:2,par:4,hcpIndex:11},{hole:3,par:3,hcpIndex:15},{hole:4,par:5,hcpIndex:5},{hole:5,par:4,hcpIndex:13},{hole:6,par:4,hcpIndex:9},{hole:7,par:3,hcpIndex:17},{hole:8,par:4,hcpIndex:7},{hole:9,par:5,hcpIndex:3},{hole:10,par:5,hcpIndex:8},{hole:11,par:3,hcpIndex:18},{hole:12,par:4,hcpIndex:10},{hole:13,par:4,hcpIndex:14},{hole:14,par:3,hcpIndex:16},{hole:15,par:5,hcpIndex:4},{hole:16,par:3,hcpIndex:12},{hole:17,par:4,hcpIndex:2},{hole:18,par:4,hcpIndex:6}] },
        pinelakes: { name: "Pine Lakes Country Club", data: [{hole:1,par:4,hcpIndex:15},{hole:2,par:3,hcpIndex:9},{hole:3,par:4,hcpIndex:1},{hole:4,par:4,hcpIndex:17},{hole:5,par:5,hcpIndex:3},{hole:6,par:4,hcpIndex:7},{hole:7,par:4,hcpIndex:13},{hole:8,par:3,hcpIndex:5},{hole:9,par:4,hcpIndex:11},{hole:10,par:5,hcpIndex:10},{hole:11,par:3,hcpIndex:18},{hole:12,par:4,hcpIndex:8},{hole:13,par:4,hcpIndex:4},{hole:14,par:4,hcpIndex:2},{hole:15,par:4,hcpIndex:16},{hole:16,par:3,hcpIndex:14},{hole:17,par:4,hcpIndex:12},{hole:18,par:4,hcpIndex:6}] },
        pinehills: { name: "Myrtlewood - Pine Hills", data: [{hole:1,par:4,hcpIndex:9},{hole:2,par:4,hcpIndex:13},{hole:3,par:5,hcpIndex:1},{hole:4,par:3,hcpIndex:15},{hole:5,par:4,hcpIndex:11},{hole:6,par:3,hcpIndex:17},{hole:7,par:4,hcpIndex:7},{hole:8,par:4,hcpIndex:3},{hole:9,par:5,hcpIndex:5},{hole:10,par:4,hcpIndex:8},{hole:11,par:3,hcpIndex:16},{hole:12,par:4,hcpIndex:14},{hole:13,par:5,hcpIndex:4},{hole:14,par:4,hcpIndex:10},{hole:15,par:5,hcpIndex:2},{hole:16,par:4,hcpIndex:12},{hole:17,par:3,hcpIndex:18},{hole:18,par:4,hcpIndex:6}] },
        prestwick: { name: "Prestwick Country Club", data: [{hole:1,par:4,hcpIndex:13},{hole:2,par:5,hcpIndex:5},{hole:3,par:4,hcpIndex:1},{hole:4,par:3,hcpIndex:15},{hole:5,par:4,hcpIndex:11},{hole:6,par:5,hcpIndex:7},{hole:7,par:3,hcpIndex:17},{hole:8,par:4,hcpIndex:3},{hole:9,par:4,hcpIndex:9},{hole:10,par:4,hcpIndex:8},{hole:11,par:5,hcpIndex:10},{hole:12,par:3,hcpIndex:18},{hole:13,par:4,hcpIndex:14},{hole:14,par:4,hcpIndex:4},{hole:15,par:5,hcpIndex:2},{hole:16,par:4,hcpIndex:12},{hole:17,par:3,hcpIndex:16},{hole:18,par:4,hcpIndex:6}] },
        manofwar: { name: "Man O' War Golf Club", data: [{hole:1,par:5,hcpIndex:3},{hole:2,par:3,hcpIndex:17},{hole:3,par:4,hcpIndex:9},{hole:4,par:4,hcpIndex:11},{hole:5,par:4,hcpIndex:5},{hole:6,par:3,hcpIndex:15},{hole:7,par:4,hcpIndex:13},{hole:8,par:5,hcpIndex:1},{hole:9,par:4,hcpIndex:7},{hole:10,par:4,hcpIndex:8},{hole:11,par:4,hcpIndex:12},{hole:12,par:4,hcpIndex:6},{hole:13,par:5,hcpIndex:2},{hole:14,par:4,hcpIndex:10},{hole:15,par:3,hcpIndex:18},{hole:16,par:4,hcpIndex:14},{hole:17,par:3,hcpIndex:16},{hole:18,par:5,hcpIndex:4}] },
        eaglespride_redblue: { name: "Eagle's Pride (Red/Blue)", data: [{hole:1,par:5,hcpIndex:7},{hole:2,par:3,hcpIndex:13},{hole:3,par:5,hcpIndex:3},{hole:4,par:4,hcpIndex:11},{hole:5,par:4,hcpIndex:1},{hole:6,par:5,hcpIndex:9},{hole:7,par:4,hcpIndex:5},{hole:8,par:3,hcpIndex:15},{hole:9,par:4,hcpIndex:17},{hole:10,par:4,hcpIndex:12},{hole:11,par:4,hcpIndex:14},{hole:12,par:3,hcpIndex:18},{hole:13,par:4,hcpIndex:2},{hole:14,par:3,hcpIndex:16},{hole:15,par:4,hcpIndex:8},{hole:16,par:4,hcpIndex:10},{hole:17,par:4,hcpIndex:4},{hole:18,par:5,hcpIndex:6}] },
        eaglespride_redgreen: { name: "Eagle's Pride (Red/Green)", data: [{hole:1,par:5,hcpIndex:7},{hole:2,par:3,hcpIndex:13},{hole:3,par:5,hcpIndex:3},{hole:4,par:4,hcpIndex:11},{hole:5,par:4,hcpIndex:1},{hole:6,par:5,hcpIndex:9},{hole:7,par:4,hcpIndex:5},{hole:8,par:3,hcpIndex:15},{hole:9,par:4,hcpIndex:17},{hole:10,par:4,hcpIndex:8},{hole:11,par:3,hcpIndex:10},{hole:12,par:4,hcpIndex:12},{hole:13,par:4,hcpIndex:4},{hole:14,par:5,hcpIndex:6},{hole:15,par:5,hcpIndex:2},{hole:16,par:3,hcpIndex:18},{hole:17,par:4,hcpIndex:16},{hole:18,par:4,hcpIndex:14}] },
        swwa_tahoma_valley: { name: "Tahoma Valley Golf Course (Yelm)", data: [{hole:1,par:5,hcpIndex:4},{hole:2,par:5,hcpIndex:2},{hole:3,par:4,hcpIndex:6},{hole:4,par:3,hcpIndex:18},{hole:5,par:4,hcpIndex:14},{hole:6,par:3,hcpIndex:8},{hole:7,par:4,hcpIndex:10},{hole:8,par:4,hcpIndex:12},{hole:9,par:3,hcpIndex:16},{hole:10,par:4,hcpIndex:11},{hole:11,par:4,hcpIndex:7},{hole:12,par:5,hcpIndex:5},{hole:13,par:3,hcpIndex:13},{hole:14,par:4,hcpIndex:9},{hole:15,par:3,hcpIndex:15},{hole:16,par:5,hcpIndex:1},{hole:17,par:3,hcpIndex:17},{hole:18,par:5,hcpIndex:3}] },
        swwa_camasmeadows: { name: "Camas Meadows Golf Club", data: [{hole:1,par:4,hcpIndex:7},{hole:2,par:3,hcpIndex:13},{hole:3,par:4,hcpIndex:9},{hole:4,par:4,hcpIndex:3},{hole:5,par:4,hcpIndex:15},{hole:6,par:4,hcpIndex:1},{hole:7,par:5,hcpIndex:11},{hole:8,par:3,hcpIndex:17},{hole:9,par:5,hcpIndex:5},{hole:10,par:4,hcpIndex:12},{hole:11,par:4,hcpIndex:6},{hole:12,par:5,hcpIndex:2},{hole:13,par:3,hcpIndex:16},{hole:14,par:4,hcpIndex:8},{hole:15,par:4,hcpIndex:14},{hole:16,par:4,hcpIndex:4},{hole:17,par:3,hcpIndex:18},{hole:18,par:5,hcpIndex:10}] },
        wa_chambers: { name: "Chambers Bay", data: [{hole:1,par:4,hcpIndex:3},{hole:2,par:4,hcpIndex:9},{hole:3,par:3,hcpIndex:15},{hole:4,par:5,hcpIndex:13},{hole:5,par:4,hcpIndex:5},{hole:6,par:4,hcpIndex:7},{hole:7,par:4,hcpIndex:1},{hole:8,par:5,hcpIndex:17},{hole:9,par:3,hcpIndex:11},{hole:10,par:4,hcpIndex:4},{hole:11,par:4,hcpIndex:8},{hole:12,par:4,hcpIndex:18},{hole:13,par:5,hcpIndex:14},{hole:14,par:4,hcpIndex:2},{hole:15,par:3,hcpIndex:16},{hole:16,par:4,hcpIndex:10},{hole:17,par:3,hcpIndex:6},{hole:18,par:5,hcpIndex:12}] },
        swwa_lewisriver: { name: "Lewis River Golf Course", data: [{hole:1,par:4,hcpIndex:15},{hole:2,par:4,hcpIndex:5},{hole:3,par:3,hcpIndex:13},{hole:4,par:4,hcpIndex:9},{hole:5,par:5,hcpIndex:1},{hole:6,par:4,hcpIndex:7},{hole:7,par:3,hcpIndex:3},{hole:8,par:4,hcpIndex:11},{hole:9,par:4,hcpIndex:17},{hole:10,par:5,hcpIndex:10},{hole:11,par:3,hcpIndex:16},{hole:12,par:5,hcpIndex:4},{hole:13,par:4,hcpIndex:8},{hole:14,par:4,hcpIndex:2},{hole:15,par:5,hcpIndex:12},{hole:16,par:4,hcpIndex:14},{hole:17,par:3,hcpIndex:18},{hole:18,par:4,hcpIndex:6}] },
        swwa_elkridge: { name: "Elk Ridge Golf Course", data: [{hole:1,par:4,hcpIndex:7},{hole:2,par:4,hcpIndex:3},{hole:3,par:3,hcpIndex:15},{hole:4,par:5,hcpIndex:17},{hole:5,par:4,hcpIndex:1},{hole:6,par:3,hcpIndex:13},{hole:7,par:4,hcpIndex:5},{hole:8,par:4,hcpIndex:9},{hole:9,par:5,hcpIndex:11},{hole:10,par:5,hcpIndex:12},{hole:11,par:4,hcpIndex:14},{hole:12,par:4,hcpIndex:6},{hole:13,par:3,hcpIndex:10},{hole:14,par:4,hcpIndex:18},{hole:15,par:4,hcpIndex:2},{hole:16,par:3,hcpIndex:16},{hole:17,par:4,hcpIndex:4},{hole:18,par:4,hcpIndex:8}] },
        or_indiancreek: { name: "Indian Creek Golf Course", data: [{hole:1,par:4,hcpIndex:3},{hole:2,par:4,hcpIndex:13},{hole:3,par:4,hcpIndex:11},{hole:4,par:5,hcpIndex:5},{hole:5,par:3,hcpIndex:9},{hole:6,par:4,hcpIndex:15},{hole:7,par:4,hcpIndex:17},{hole:8,par:3,hcpIndex:7},{hole:9,par:5,hcpIndex:1},{hole:10,par:3,hcpIndex:18},{hole:11,par:5,hcpIndex:8},{hole:12,par:4,hcpIndex:4},{hole:13,par:4,hcpIndex:10},{hole:14,par:4,hcpIndex:14},{hole:15,par:3,hcpIndex:12},{hole:16,par:5,hcpIndex:6},{hole:17,par:4,hcpIndex:2},{hole:18,par:4,hcpIndex:16}] },
        or_stonecreek: { name: "Stone Creek Golf Club", data: [{hole:1,par:4,hcpIndex:8},{hole:2,par:3,hcpIndex:18},{hole:3,par:4,hcpIndex:10},{hole:4,par:5,hcpIndex:2},{hole:5,par:4,hcpIndex:12},{hole:6,par:3,hcpIndex:16},{hole:7,par:4,hcpIndex:6},{hole:8,par:5,hcpIndex:4},{hole:9,par:4,hcpIndex:14},{hole:10,par:4,hcpIndex:9},{hole:11,par:5,hcpIndex:1},{hole:12,par:4,hcpIndex:11},{hole:13,par:4,hcpIndex:3},{hole:14,par:3,hcpIndex:15},{hole:15,par:4,hcpIndex:7},{hole:16,par:3,hcpIndex:17},{hole:17,par:4,hcpIndex:13},{hole:18,par:5,hcpIndex:5}] },
        or_wildwood: { name: "Wildwood Golf Course", data: [{hole:1,par:5,hcpIndex:1},{hole:2,par:4,hcpIndex:7},{hole:3,par:3,hcpIndex:15},{hole:4,par:5,hcpIndex:5},{hole:5,par:4,hcpIndex:11},{hole:6,par:3,hcpIndex:13},{hole:7,par:4,hcpIndex:9},{hole:8,par:3,hcpIndex:3},{hole:9,par:5,hcpIndex:17},{hole:10,par:4,hcpIndex:16},{hole:11,par:4,hcpIndex:4},{hole:12,par:3,hcpIndex:12},{hole:13,par:4,hcpIndex:2},{hole:14,par:3,hcpIndex:10},{hole:15,par:5,hcpIndex:14},{hole:16,par:5,hcpIndex:8},{hole:17,par:4,hcpIndex:18},{hole:18,par:4,hcpIndex:6}] },
        or_glendoveer_east: { name: "Glendoveer Golf Course (East)", data: [{hole:1,par:4,hcpIndex:5},{hole:2,par:5,hcpIndex:13},{hole:3,par:3,hcpIndex:9},{hole:4,par:5,hcpIndex:7},{hole:5,par:3,hcpIndex:1},{hole:6,par:4,hcpIndex:17},{hole:7,par:5,hcpIndex:3},{hole:8,par:4,hcpIndex:15},{hole:9,par:3,hcpIndex:11},{hole:10,par:4,hcpIndex:8},{hole:11,par:4,hcpIndex:4},{hole:12,par:4,hcpIndex:10},{hole:13,par:3,hcpIndex:12},{hole:14,par:4,hcpIndex:16},{hole:15,par:5,hcpIndex:2},{hole:16,par:4,hcpIndex:18},{hole:17,par:5,hcpIndex:6},{hole:18,par:4,hcpIndex:14}] },
        swwa_trimountain: { name: "Tri-Mountain Golf Course", data: [{hole:1,par:4,hcpIndex:3},{hole:2,par:4,hcpIndex:13},{hole:3,par:4,hcpIndex:1},{hole:4,par:4,hcpIndex:15},{hole:5,par:4,hcpIndex:11},{hole:6,par:3,hcpIndex:17},{hole:7,par:5,hcpIndex:9},{hole:8,par:4,hcpIndex:5},{hole:9,par:5,hcpIndex:7},{hole:10,par:4,hcpIndex:10},{hole:11,par:3,hcpIndex:16},{hole:12,par:4,hcpIndex:4},{hole:13,par:5,hcpIndex:12},{hole:14,par:4,hcpIndex:8},{hole:15,par:3,hcpIndex:18},{hole:16,par:4,hcpIndex:2},{hole:17,par:3,hcpIndex:14},{hole:18,par:5,hcpIndex:6}] },
        or_glendoveer_west: { name: "Glendoveer Golf Course (West)", data: [{hole:1,par:4,hcpIndex:15},{hole:2,par:4,hcpIndex:17},{hole:3,par:4,hcpIndex:5},{hole:4,par:3,hcpIndex:11},{hole:5,par:4,hcpIndex:13},{hole:6,par:4,hcpIndex:1},{hole:7,par:4,hcpIndex:9},{hole:8,par:4,hcpIndex:7},{hole:9,par:5,hcpIndex:3},{hole:10,par:4,hcpIndex:18},{hole:11,par:4,hcpIndex:4},{hole:12,par:3,hcpIndex:16},{hole:13,par:4,hcpIndex:10},{hole:14,par:4,hcpIndex:6},{hole:15,par:5,hcpIndex:14},{hole:16,par:4,hcpIndex:2},{hole:17,par:3,hcpIndex:8},{hole:18,par:4,hcpIndex:12}] },
        
        az_tpc_stadium: { name: "TPC Scottsdale (Stadium)", data: [{hole:1,par:4,hcpIndex:9},{hole:2,par:4,hcpIndex:5},{hole:3,par:5,hcpIndex:1},{hole:4,par:3,hcpIndex:15},{hole:5,par:4,hcpIndex:7},{hole:6,par:4,hcpIndex:11},{hole:7,par:3,hcpIndex:17},{hole:8,par:4,hcpIndex:3},{hole:9,par:4,hcpIndex:13},{hole:10,par:4,hcpIndex:8},{hole:11,par:4,hcpIndex:2},{hole:12,par:3,hcpIndex:16},{hole:13,par:5,hcpIndex:4},{hole:14,par:4,hcpIndex:10},{hole:15,par:5,hcpIndex:6},{hole:16,par:3,hcpIndex:18},{hole:17,par:4,hcpIndex:14},{hole:18,par:4,hcpIndex:12}] },
        az_talking_oodham: { name: "Talking Stick Golf Club (O'odham)", data: [{hole:1,par:4,hcpIndex:15},{hole:2,par:5,hcpIndex:13},{hole:3,par:4,hcpIndex:1},{hole:4,par:4,hcpIndex:3},{hole:5,par:4,hcpIndex:11},{hole:6,par:3,hcpIndex:5},{hole:7,par:4,hcpIndex:9},{hole:8,par:3,hcpIndex:17},{hole:9,par:4,hcpIndex:7},{hole:10,par:4,hcpIndex:12},{hole:11,par:3,hcpIndex:6},{hole:12,par:4,hcpIndex:2},{hole:13,par:4,hcpIndex:16},{hole:14,par:4,hcpIndex:8},{hole:15,par:4,hcpIndex:14},{hole:16,par:3,hcpIndex:18},{hole:17,par:5,hcpIndex:4},{hole:18,par:4,hcpIndex:10}] },
        az_wekopa_cholla: { name: "We-Ko-Pa Golf Club (Cholla)", data: [{hole:1,par:4,hcpIndex:5},{hole:2,par:5,hcpIndex:1},{hole:3,par:3,hcpIndex:17},{hole:4,par:4,hcpIndex:9},{hole:5,par:3,hcpIndex:15},{hole:6,par:4,hcpIndex:11},{hole:7,par:4,hcpIndex:7},{hole:8,par:5,hcpIndex:3},{hole:9,par:4,hcpIndex:13},{hole:10,par:5,hcpIndex:4},{hole:11,par:3,hcpIndex:16},{hole:12,par:4,hcpIndex:8},{hole:13,par:4,hcpIndex:12},{hole:14,par:3,hcpIndex:18},{hole:15,par:4,hcpIndex:6},{hole:16,par:4,hcpIndex:14},{hole:17,par:5,hcpIndex:2},{hole:18,par:4,hcpIndex:10}] },
        az_talking_piipaash: { name: "Talking Stick Golf Club (Piipaash)", data: [{hole:1,par:4,hcpIndex:13},{hole:2,par:4,hcpIndex:3},{hole:3,par:3,hcpIndex:7},{hole:4,par:4,hcpIndex:17},{hole:5,par:4,hcpIndex:1},{hole:6,par:4,hcpIndex:15},{hole:7,par:5,hcpIndex:9},{hole:8,par:4,hcpIndex:5},{hole:9,par:3,hcpIndex:11},{hole:10,par:4,hcpIndex:10},{hole:11,par:4,hcpIndex:8},{hole:12,par:4,hcpIndex:2},{hole:13,par:3,hcpIndex:16},{hole:14,par:5,hcpIndex:6},{hole:15,par:4,hcpIndex:4},{hole:16,par:5,hcpIndex:14},{hole:17,par:3,hcpIndex:18},{hole:18,par:4,hcpIndex:12}] },
        
        oaklane: { name: "Tradition at Oak Lane", data: [{hole:1,par:5,hcpIndex:1},{hole:2,par:4,hcpIndex:7},{hole:3,par:4,hcpIndex:3},{hole:4,par:3,hcpIndex:17},{hole:5,par:4,hcpIndex:9},{hole:6,par:3,hcpIndex:15},{hole:7,par:4,hcpIndex:11},{hole:8,par:4,hcpIndex:13},{hole:9,par:5,hcpIndex:5},{hole:10,par:4,hcpIndex:2},{hole:11,par:3,hcpIndex:10},{hole:12,par:4,hcpIndex:14},{hole:13,par:4,hcpIndex:16},{hole:14,par:5,hcpIndex:6},{hole:15,par:3,hcpIndex:18},{hole:16,par:4,hcpIndex:8},{hole:17,par:5,hcpIndex:12},{hole:18,par:4,hcpIndex:4}] },
        orangehills: { name: "Orange Hills Country Club", data: [{hole:1,par:4,hcpIndex:9},{hole:2,par:5,hcpIndex:5},{hole:3,par:3,hcpIndex:17},{hole:4,par:4,hcpIndex:3},{hole:5,par:4,hcpIndex:11},{hole:6,par:4,hcpIndex:7},{hole:7,par:4,hcpIndex:1},{hole:8,par:4,hcpIndex:13},{hole:9,par:3,hcpIndex:15},{hole:10,par:3,hcpIndex:16},{hole:11,par:5,hcpIndex:10},{hole:12,par:4,hcpIndex:2},{hole:13,par:3,hcpIndex:18},{hole:14,par:4,hcpIndex:12},{hole:15,par:4,hcpIndex:4},{hole:16,par:4,hcpIndex:8},{hole:17,par:4,hcpIndex:6},{hole:18,par:5,hcpIndex:14}] },
        grassyhill: { name: "Grassy Hill Country Club", data: [{hole:1,par:4,hcpIndex:5},{hole:2,par:4,hcpIndex:1},{hole:3,par:3,hcpIndex:17},{hole:4,par:4,hcpIndex:13},{hole:5,par:5,hcpIndex:3},{hole:6,par:3,hcpIndex:9},{hole:7,par:4,hcpIndex:11},{hole:8,par:4,hcpIndex:7},{hole:9,par:5,hcpIndex:15},{hole:10,par:3,hcpIndex:10},{hole:11,par:4,hcpIndex:6},{hole:12,par:4,hcpIndex:16},{hole:13,par:3,hcpIndex:12},{hole:14,par:4,hcpIndex:14},{hole:15,par:4,hcpIndex:2},{hole:16,par:5,hcpIndex:8},{hole:17,par:3,hcpIndex:18},{hole:18,par:4,hcpIndex:4}] }
    };

    // Combines a 9-hole loop's REAL difficulty ranking into the odd (front) or even (back)
    // slots of an 18-hole handicap chart -- the standard way courses combine modular nines.
    function remapNineHandicaps(nineData, isFront) {
        const withIdx = nineData.map((item, idx) => ({ par: item.par, hcp: item.hcp, origIdx: idx }));
        const sortedByDifficulty = [...withIdx].sort((a, b) => a.hcp - b.hcp);
        const rankMap = {};
        sortedByDifficulty.forEach((item, rank) => {
            rankMap[item.origIdx] = isFront ? (rank * 2) + 1 : (rank * 2) + 2;
        });
        return nineData.map((item, idx) => ({ par: item.par, hcpIndex: rankMap[idx] }));
    }

    // Looks up a course's display name by id across every known source: the searchable
    // directory, Firebase's live global_courses, and the Thistle 27-hole special case.
    // Both admin.html and trip.html pass in their own globalCourses (each fetches it
    // independently from Firebase) so this stays a pure function with no shared state.
    function getCourseNameById(id, globalCoursesRef) {
        if (!id) return "";
        for (let g of courseDirectory) {
            for (let i of g.items) {
                if (i.id === id) return i.name;
            }
        }
        if (globalCoursesRef && globalCoursesRef[id]) return globalCoursesRef[id].name;
        if (id === 'thistle_27') return "Thistle Golf Club (NC - 27 Hole)";
        return "";
    }
