// ============================================================================
// THE STAND-IN SERVER FOR THE SETUP SIMULATIONS (mailbox 013).
//
// Test data only: invented round codes and the two test rounds (ZNBLP8, 5RZ8GE).
// No real round (the Myrtle trip VWNPW6 and its rounds, NA4EZB, KHPSL4, 3MKUCF,
// P7S2BE, ...) is ever named here.
//
// DOBSON RANCH, as the shared records stand after URGENT-006:
//   gca_zgkynkan            the one to offer: Back / DRGA Tournament Tee / White / Red
//   gapi_0121324924309988   the duplicate, mergedInto gca_zgkynkan - offered by NO picker
// ============================================================================
'use strict';
const PARS = [5, 4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 3, 4, 4, 3, 5];
const HCPS = [3, 11, 7, 15, 1, 9, 17, 13, 5, 8, 12, 16, 2, 18, 6, 10, 14, 4];
const card = (pars, hcps) => pars.map((par, i) => ({ hole: i + 1, par, hcpIndex: hcps[i] }));
const teeHoles = (yds) => PARS.map((par, i) => ({ par, yardage: Math.round(yds / 18 + (par - 4) * 120), handicap: HCPS[i] }));

const DOBSON = {
    name: 'Dobson Ranch Golf Course',
    location: { city: 'Mesa', state: 'AZ', country: 'United States', latitude: 33.3717, longitude: -111.8726 },
    source: 'golfcourseapi', sourceId: 'zgkynkan', importedAt: Date.parse('2026-10-10T18:00:00Z'),
    data: card(PARS, HCPS),
    tees: {
        male: [
            { tee_name: 'Back', course_rating: 71.1, slope_rating: 123, par_total: 72, total_yards: 6586, number_of_holes: 18, holes: teeHoles(6586) },
            { tee_name: 'DRGA Tournament Tee', course_rating: 70.2, slope_rating: 121, par_total: 72, total_yards: 6394, number_of_holes: 18, holes: teeHoles(6394) },
            { tee_name: 'White', course_rating: 69.3, slope_rating: 118, par_total: 72, total_yards: 6187, number_of_holes: 18, holes: teeHoles(6187) }
        ],
        female: [
            { tee_name: 'Red', course_rating: 71.4, slope_rating: 119, par_total: 72, total_yards: 5645, number_of_holes: 18, holes: teeHoles(5645) }
        ]
    }
};
const DOBSON_DUP = {
    name: 'Dobson Ranch Golf Course',
    location: { city: 'Mesa', state: 'AZ', country: 'United States' },
    source: 'golfapi', sourceId: '0121324924309988', importedAt: Date.parse('2026-10-17T18:00:00Z'),
    data: card(PARS, HCPS),
    tees: { male: [
        { tee_name: '&', course_rating: 72.0, slope_rating: 127, par_total: 72, total_yards: 6774, number_of_holes: 18 },
        { tee_name: 'Blue', course_rating: 72.3, slope_rating: 128, par_total: 72, total_yards: 6803, number_of_holes: 18 },
        { tee_name: 'White', course_rating: 69.3, slope_rating: 118, par_total: 72, total_yards: 6180, number_of_holes: 18 }
    ], female: [
        { tee_name: 'Gold', course_rating: 70.0, slope_rating: 117, par_total: 72, total_yards: 5451, number_of_holes: 18 },
        { tee_name: '*', course_rating: 70.5, slope_rating: 118, par_total: 72, total_yards: 5598, number_of_holes: 18 }
    ] },
    mergedInto: 'gca_zgkynkan', mergedAt: Date.parse('2026-10-18T18:10:00Z'), mergedNote: 'URGENT-006 duplicate'
};

// URGENT-004: Manny's exact text, both forms.
const PAIRINGS_SLASH = `Skeens 2.0/A
Bob 5.0/A
Manny +2.0/A
Paul 4.0/A

Glenn 12.0/B
Marty 9.0/B
Scott 6.0/B
Eddie 12.0/B

Carl 6.0/A
Matt 8.0/B
Jeremy 14.0/B
Matt 12.0/B

Kopp 6.0/A
Tim 1.0/A
Dalen +2.0/A
Mike 4.0/A

Crone 10.0/B
Todd 14.0/B
Mike 6.0/A
Jim 12.0/B`;
const PAIRINGS_SPACE = PAIRINGS_SLASH.replace(/\//g, ' ');
const NAMES = ['Skeens', 'Bob', 'Manny', 'Paul', 'Glenn', 'Marty', 'Scott', 'Eddie', 'Carl', 'Matt', 'Jeremy', 'Matt', 'Kopp', 'Tim', 'Dalen', 'Mike', 'Crone', 'Todd', 'Mike', 'Jim'];
const HCP = ['2.0', '5.0', '+2.0', '4.0', '12.0', '9.0', '6.0', '12.0', '6.0', '8.0', '14.0', '12.0', '6.0', '1.0', '+2.0', '4.0', '10.0', '14.0', '6.0', '12.0'];
const FLIGHT = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'A', 'B', 'B', 'B', 'A', 'A', 'A', 'A', 'B', 'B', 'A', 'B'];

function server() {
    return {
        events: {},
        global_courses: { gca_zgkynkan: DOBSON, gapi_0121324924309988: DOBSON_DUP },
        trips: {}, organizers: {}, tournaments: {}, course_gps: {}
    };
}
const DOBSON_TEE1 = [33.37585, -111.877757];
module.exports = { DOBSON, DOBSON_DUP, PAIRINGS_SLASH, PAIRINGS_SPACE, NAMES, HCP, FLIGHT, server, DOBSON_TEE1, PARS };
