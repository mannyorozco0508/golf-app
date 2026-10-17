# Trips ownerUid migration (mailbox 003 / 005, 2026-10-17)

trips-ownerUid-2026-10-17.json stamps trips/<code>/ownerUid on 6 trips (nothing else is written):
- Manny's account (h8Axne…): TF93GJ, 3SKVBL, 9WLQ63, FYYQ95 (Manny 2026-10-17). VWNPW6 is already his.
- BZ86G3 -> YvI3lS… and RE3ER3 -> TFM8Iu… (every owned round in each has that one owner).

LEFT WITHOUT AN OWNER (Manny 2026-10-17: read-only until claimed): 362N24 5FL8 6456 6BZN CN52 CRXG
H7V8 HHBY J8J6 L95E LDYQHF MYRDEMO R7KP UXYX Z28Y. Readable by any signed-in phone; nobody can
edit them from a phone until an owner is stamped (an Admin write, with Manny's OK).

Run ONLY with Manny's OK, right AFTER the phase-1 rules are published:
  firebase database:update / rules/migrations/trips-ownerUid-2026-10-17.json --project golfapp-9fb21
