# Trips ownerUid migration (mailbox 003, 2026-10-17) - NOT RUN

trips-ownerUid-2026-10-17.json stamps ownerUid on the 5 trips whose rounds all have ONE owner
(read-only CLI reads of trips/<code> and events/<round>/ownerUid on 2026-10-17):
3SKVBL, 9WLQ63, FYYQ95, BZ86G3, RE3ER3.

Not in it:
- TF93GJ (its rounds are the protected Myrtle rounds NA4EZB / KHPSL4 / 3MKUCF) and VWNPW6
  (protected; it already has an ownerUid) - left for Manny.
- 15 trips with no owner to find (no rounds, or only legacy rounds with no ownerUid):
  362N24 5FL8 6456 6BZN CN52 CRXG H7V8 HHBY J8J6 L95E LDYQHF MYRDEMO R7KP UXYX Z28Y.
  Under the proposed rules nobody can edit them from a phone (admin only). None has an
  ownerEmail either, so there is no one to give them to without Manny naming them.

Run ONLY with Manny's OK, AFTER the rules are published (a data write):
  firebase database:update / rules/migrations/trips-ownerUid-2026-10-17.json --project golfapp-9fb21
