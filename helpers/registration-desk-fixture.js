// ============================================================================
// A MANY-ENTRY REGISTRATION FIXTURE, for the desk at the size the product is
// sold to. tournament_desk_2c_test.js (mini-dom) and tools/tournament-desk-check.js
// (Chrome) both read it, so the numbers the two halves assert are the same numbers.
//
// deskEntries() is deterministic: 140 golfers plus two deliberate duplicates.
//   ids e000..e139 in createdAt order EXCEPT e003/e004, whose createdAt are swapped
//       so an "ids are already sorted" renderer goes red on the sort assertion.
//   paid:      every even i (70 of 140), paidAt stamped
//   in field:  every i % 10 === 0 (14 of 140) - approvedAt + teamNum 1 (team) or
//              playerId (individual) depending on `mode`
//   shirt:     S M L XL by i % 4, but every 5th entry (i % 5 === 0) gave none
//   dinner:    i % 3 guests, but every 4th entry (i % 4 === 3) did not answer
//   teamPreference 'Hawks' on i % 7 === 0
// The duplicates:
//   e140  "Fay Different"     SAME EMAIL as e005 (g5@example.com), unpaid
//   e141  "  ben  BSURNAME1 " SAME NAME as e001 (case and spacing differ), other email
// Totals the tests pin (142 entries): 70 paid, 14 in the field, dinners 106 guests from
// 107 answers, shirts 28 S · 29 M · 29 L · 28 XL from 114 answers.
// ============================================================================
const FIRST = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jon', 'Kim', 'Lee', 'Max', 'Ned', 'Ola', 'Pat', 'Quin', 'Rae', 'Sam', 'Tia'];
const SHIRTS = ['S', 'M', 'L', 'XL'];

function deskEntries(mode) {
    const individual = mode === 'individual';
    const regs = {};
    for (let i = 0; i < 140; i++) {
        const e = {
            fullName: FIRST[i % 20] + ' ' + String.fromCharCode(65 + (i % 26)) + 'surname' + i,
            email: 'g' + i + '@example.com',
            phone: '555-' + String(1000 + i),
            createdAt: 1000 + (i === 3 ? 4 : i === 4 ? 3 : i)
        };
        if (i % 5 !== 0) e.shirtSize = SHIRTS[i % 4];
        if (i % 4 !== 3) e.dinnerCount = i % 3;
        if (i % 7 === 0) e.teamPreference = 'Hawks';
        if (i % 2 === 0) { e.paid = true; e.paidAt = 2000 + i; }
        if (i % 10 === 0) { e.approvedAt = 3000 + i; if (individual) e.playerId = 'p' + i; else e.teamNum = 1; }
        regs['e' + String(i).padStart(3, '0')] = e;
    }
    regs.e140 = { fullName: 'Fay Different', email: 'g5@example.com', phone: '555-9140', createdAt: 5140, shirtSize: 'M', dinnerCount: 1 };
    regs.e141 = { fullName: '  ben  BSURNAME1 ', email: 'other@example.com', phone: '555-9141', createdAt: 5141, shirtSize: 'L', dinnerCount: 0 };
    return regs;
}

// The literal totals above, computed once here so a test can also compare the
// fixture to itself and fail loudly if someone edits the generator.
const TOTALS = { entries: 142, paid: 70, inField: 14, dinnerGuests: 106, dinnerAnswered: 107, shirtAnswered: 114, shirts: { S: 28, M: 29, L: 29, XL: 28 }, unpaid: 72, pending: 128 };

module.exports = { deskEntries, TOTALS };
