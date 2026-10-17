# Trips ownerUid migration (mailbox 003 / 005, 2026-10-17) - PREPARED, NOT RUN

trips-ownerUid-2026-10-17.json stamps trips/<code>/ownerUid on 21 trips (nothing else is written):
- Manny's account (h8Axne…, mailbox 005: "the owner of ALL owner-less trips, including TF93GJ"):
  the 15 trips with no owner to find (362N24 5FL8 6456 6BZN CN52 CRXG H7V8 HHBY J8J6 L95E LDYQHF
  MYRDEMO R7KP UXYX Z28Y), TF93GJ, and 3SKVBL / 9WLQ63 / FYYQ95 (every owned round in them is his).
- BZ86G3 -> YvI3lS… and RE3ER3 -> TFM8Iu… (every owned round in each has that one owner).
- VWNPW6 already has ownerUid = Manny's; not in the patch.
Read-only CLI reads on 2026-10-17 found these owners (trips/<code>, events/<round>/ownerUid).

WHY IT MATTERS: the live rules require an ownerEmail on every trip and no trip has one, so live
refuses every trip write today. The new rules accept a trip with its ownerUid - after this runs, the
owner can edit each trip again, and its golfers can write who-am-I and the league.

Run ONLY with Manny's OK, right AFTER the phase-1 rules are published (a data write; the Admin CLI
is not bound by the rules):
  firebase database:update / rules/migrations/trips-ownerUid-2026-10-17.json --project golfapp-9fb21
