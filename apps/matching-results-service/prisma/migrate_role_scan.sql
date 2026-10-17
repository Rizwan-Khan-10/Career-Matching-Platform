-- Run ONCE before `prisma db push` (task 3.1). RoleScan is now one row per (jobRoleId, resumeId):
--   * resumeId becomes required, so old rows without a resume are useless -> removed (matching-agent re-sends them),
--   * the new @@unique([jobRoleId, resumeId]) fails if duplicates exist -> keep the newest row per pair.
-- Dashboard numbers refill by themselves the next time matching-agent publishes `match.scanned`.
DELETE FROM "matches_service"."RoleScan" WHERE "resumeId" IS NULL;

DELETE FROM "matches_service"."RoleScan" s
USING "matches_service"."RoleScan" newer
WHERE s."jobRoleId" = newer."jobRoleId"
  AND s."resumeId"  = newer."resumeId"
  AND (s."scannedAt" < newer."scannedAt" OR (s."scannedAt" = newer."scannedAt" AND s.id < newer.id));
