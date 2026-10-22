-- ONE-TIME backfill (run once, after deploying the maxExperienceYears change):
-- before this change a fresher role had no upper experience limit stored. The role form now pre-fills max = 1 for fresher
-- roles, so existing fresher roles get the same value. Roles that already have the key (even null = "no limit") are untouched.
--
--   psql "$DATABASE_URL" -f prisma/backfill_fresher_max_experience.sql
-- Afterwards re-match so the new limit applies:  python -m scripts.backfill_embeddings --rematch   (apps/matching-agent)
--
-- Look first:  SELECT count(*) FROM jobs_service."JobRole" WHERE requirements->>'level' = 'fresher' AND NOT (requirements::jsonb ? 'maxExperienceYears');
UPDATE jobs_service."JobRole"
SET requirements = jsonb_set(requirements::jsonb, '{maxExperienceYears}', '1'::jsonb)
WHERE requirements->>'level' = 'fresher'
  AND NOT (requirements::jsonb ? 'maxExperienceYears');
