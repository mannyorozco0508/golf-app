// Mockups for the Starkey prize settings plan (Manny 2026-11-19, plan + mockups only). Writes starkey-settings-a/b/c.html.
// Invented names only. Prize type shown: Cash (the organizer's existing Prize type switch); amounts are the 2026 schedule.
'use strict';
const fs = require('fs'); const path = require('path');
const css = `
:root{--bg-page:#f4f6f8;--bg-card:#fff;--text-main:#1a1a1a;--text-muted:#666;--brand-green:#0f4c3a;--brand-navy:#1d3557;--accent-teal:#2a9d8f;--border-mid:#d0e1db;--border-faint:#eee;--subtle-bg:#e0e8e4;--warn-bg:#fff4e5}
@media (prefers-color-scheme:dark){:root{--bg-page:#101814;--bg-card:#17221d;--text-main:#eef3f0;--text-muted:#a7b4ad;--brand-green:#7fd1b2;--brand-navy:#a9c4ea;--border-mid:#2c3d35;--border-faint:#22302a;--subtle-bg:#22302a;--warn-bg:#3a2e1a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg-page);color:var(--text-main);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px}
.wrap{max-width:420px;margin:0 auto;padding:14px 16px 40px}
.mk{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-teal);font-weight:800;margin:0 0 4px}
h1{font-size:1.25rem;margin:0 0 4px}h3{font-size:1.05rem;margin:14px 0 8px}
.sub{color:var(--text-muted);font-size:.85rem;margin:0 0 12px}
.card{border:1px solid var(--border-mid);border-radius:14px;padding:10px 14px;margin-bottom:12px;background:var(--bg-card)}
.t{font-weight:800;font-size:1.02rem;display:flex;justify-content:space-between;align-items:center}
.k{font-size:.78rem;color:var(--text-muted);margin:10px 0 4px;font-weight:700}
.seg{display:flex;flex-wrap:wrap;gap:3px;padding:3px;border:1px solid var(--border-mid);border-radius:12px}
.seg span{flex:1 1 auto;text-align:center;padding:7px 8px;border-radius:9px;font-size:.84rem;font-weight:700;color:var(--brand-navy)}
.seg span.on{background:var(--brand-green);color:#fff}
.row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border-faint);font-size:.88rem}
.row:first-of-type{border-top:0}.amt{font-variant-numeric:tabular-nums;font-weight:700}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{border:1px solid var(--border-mid);border-radius:999px;padding:5px 10px;font-size:.82rem;font-weight:700}
.chip.on{background:var(--brand-green);color:#fff;border-color:var(--brand-green)}
.note{font-size:.8rem;color:var(--text-muted);margin:6px 0 0}
.btn{display:inline-block;border:1px solid var(--border-mid);border-radius:10px;padding:6px 9px;font-weight:700;font-size:.8rem;color:var(--brand-navy)}
.edit{background:var(--warn-bg);border-radius:10px;padding:8px 10px;font-size:.84rem;margin-top:8px}
.sent{font-size:.9rem;padding:7px 0;border-top:1px solid var(--border-faint);display:flex;justify-content:space-between;gap:10px}
.sent:first-child{border-top:0}.sent a{color:var(--accent-teal);font-weight:700;text-decoration:none;white-space:nowrap}
.amts{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.amts div{border:1px solid var(--border-mid);border-radius:8px;padding:5px;text-align:center;font-size:.82rem;font-weight:700}
`;
const seg = (opts, on) => `<div class="seg">${opts.map((o, i) => `<span class="${i === on ? 'on' : ''}">${o}</span>`).join('')}</div>`;
const amts = (a) => `<div class="amts">${a.map((x, i) => `<div>${['1st', '2nd', '3rd', '4th'][i]}<br>$${x}</div>`).join('')}</div>`;
const placesSettings = `
<div class="k">Places pay on</div>${seg(['Gross', 'Net', 'Gross and net'], 2)}
<div class="k">Paid for</div>${seg(['The 36 holes', 'Each round', 'Both'], 0)}
<div class="k">Places, by flight</div>
<div class="row"><span>Flights 1, 2, 3 · gross and net</span><span class="btn">Edit</span></div>${amts([250, 175, 100])}
<div class="row" style="margin-top:6px"><span>Ladies · net</span><span class="btn">Edit</span></div>${amts([250, 200, 150, 100])}
<div class="k">Ties</div>${seg(['Split the tied places', 'Each gets the full prize'], 0)}
<div class="k">Round each share</div>${seg(['To the cent', 'Down to the dollar'], 0)}
<div class="k">One prize per golfer</div>${seg(['Off', 'Gross first', 'The larger prize'], 1)}
<p class="note">A golfer who places in both gross and net keeps the gross prize; the net places are paid again without them.</p>`;
const skinsSettings = `
<div class="k">Skins games</div>
<div class="row"><span><b>Men</b> · Flights 1, 2, 3</span><span>Gross + net</span></div>
<div class="row"><span><b>Ladies</b> · Ladies flight</span><span>Gross + net</span></div>
<div class="k">What a skin is worth</div>${seg(['A set amount', 'Share an amount'], 1)}
<div class="row"><span>Men share</span><span class="amt">$4,692</span></div><div class="row"><span>Ladies share</span><span class="amt">$1,500</span></div>
<p class="note">Every skin won in the game, gross or net, either round, is worth the same: the amount divided by the skins won, down to the dollar.</p>
<div class="k">Net skins use</div>${seg(['Full handicap', '¾', '½'], 0)}
<div class="k">Same hole, gross and net</div>${seg(['A golfer can take both', 'One skin per golfer per hole'], 0)}`;
const kpSettings = `
<div class="k">Closest to the pin on every par 3</div>${seg(['One for the field', 'One per flight'], 1)}
<div class="row"><span>Each KP</span><span class="amt">$50</span></div>
<div class="k">Rounds</div>${seg(['Round 1', 'Round 2', 'Both'], 2)}
<div class="k">Two golfers tie</div>${seg(['Earlier mark wins', 'They share the prize'], 1)}`;
const results = `
<h3>What this pays (sample)</h3>
<div class="card"><div class="t">Flight 1 · gross</div>
<div class="row"><span>1 Ray Holt</span><span class="amt">$250</span></div><div class="row"><span>2 Sam Ortiz</span><span class="amt">$175</span></div><div class="row"><span>3 Lee Park</span><span class="amt">$100</span></div></div>
<div class="card"><div class="t">Flight 1 · net</div>
<div class="row"><span>1 Dee Bryce</span><span class="amt">$250</span></div><div class="row"><span>2 Jo Vance</span><span class="amt">$175</span></div>
<div class="row"><span>T3 Al Moss</span><span class="amt">$50</span></div><div class="row"><span>T3 Cy Ruiz</span><span class="amt">$50</span></div>
<p class="note">Ray Holt also placed 2nd net: kept the gross prize.</p>
<div class="edit"><b>Adjust before posting</b> · tap an amount to change it. A changed row keeps your note and shows "set by the organizer".</div></div>`;
const page = (letter, title, sub, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prize rules ${letter}</title><style>${css}</style></head><body><div class="wrap">
<p class="mk">Mockup ${letter} · plan only, nothing built</p><h1>${title}</h1><p class="sub">${sub}</p>${body}</div></body></html>`;
const A = page('A', 'Prizes · Prize rules', 'One "Prize rules" card at the top of Prizes, every switch in one place. The results cards below read it.',
  `<div class="card"><div class="t">Prize rules</div>${placesSettings}<h3>Skins</h3>${skinsSettings}<h3>Closest to the pin</h3>${kpSettings}</div>${results}`);
const B = page('B', 'Prizes · How this event pays', 'Start from a format, then the rules read as sentences, each with Change.',
  `<div class="card"><div class="t">Start from</div><div class="k"></div><div class="chips"><span class="chip">Simple: places only</span><span class="chip on">Flighted · gross and net</span><span class="chip">Each round · gross and net</span></div></div>
<div class="card"><div class="t">How this event pays</div>
<div class="sent"><span>Each flight pays <b>gross and net</b> for the 36 holes.</span><a>Change</a></div>
<div class="sent"><span>Flights 1–3 pay <b>$250 / $175 / $100</b>. Ladies pay net, <b>$250 / $200 / $150 / $100</b>.</span><a>Change</a></div>
<div class="sent"><span>Ties <b>split</b> the money of the places they fill, <b>to the cent</b>.</span><a>Change</a></div>
<div class="sent"><span><b>One prize per golfer</b>: gross first.</span><a>Change</a></div>
<div class="sent"><span>Two skins games, <b>Men</b> and <b>Ladies</b>, each gross and net. Every skin shares the game's amount: <b>$4,692</b> and <b>$1,500</b>.</span><a>Change</a></div>
<div class="sent"><span>Net skins use <b>full handicap</b>. A golfer may take both skins on a hole.</span><a>Change</a></div>
<div class="sent"><span>A KP on every par 3, <b>one per flight</b>, both rounds, <b>$50</b>. A tie <b>shares</b> it.</span><a>Change</a></div></div>
<div class="card"><div class="t">Change: ties</div>${seg(['Split the tied places', 'Each gets the full prize'], 0)}<p class="note">Opens in place when Change is tapped.</p></div>${results}`);
const C = page('C', 'Prizes · rules inside each card', 'No new card: Places, Skins and KPs each gain a ⚙ Rules row that opens their own settings, right above their results.',
  `<div class="card"><div class="t">Places <span class="btn">⚙ Rules · open</span></div>${placesSettings}</div>
<div class="card"><div class="t">Flight 1 · gross</div><div class="row"><span>1 Ray Holt</span><span class="amt">$250</span></div><div class="row"><span>2 Sam Ortiz</span><span class="amt">$175</span></div><div class="row"><span>3 Lee Park</span><span class="amt">$100</span></div></div>
<div class="card"><div class="t">Skins <span class="btn">⚙ Rules</span></div><p class="note">Men: gross + net, 17 skins · $276 each. Ladies: gross + net, 20 skins · $75 each.</p></div>
<div class="card"><div class="t">Closest to the pin <span class="btn">⚙ Rules · open</span></div>${kpSettings}
<div class="row" style="margin-top:8px"><span>Hole 3 · Flight 1 · Kim Lowe 4'1"</span><span class="amt">$50</span></div>
<div class="row"><span>Hole 3 · Ladies · Ann Cole / Bea Ford, tied 6'2"</span><span class="amt">$25 each</span></div></div>
<div class="card"><div class="edit"><b>Adjust before posting</b> · any amount, with a note.</div></div>`);
const dir = process.argv[2] || __dirname;
fs.writeFileSync(path.join(dir, 'starkey-settings-a.html'), A); fs.writeFileSync(path.join(dir, 'starkey-settings-b.html'), B); fs.writeFileSync(path.join(dir, 'starkey-settings-c.html'), C);
console.log('wrote 3');
