-- Run ONCE after `prisma db push` added the `verdict` columns (default 'eligible').
-- Old rows were saved before verdicts existed: eligible=false rows were 'not_eligible', or 'review' when the
-- matching-agent already stored breakdown.verdict = 'review'.
UPDATE "matches_service"."Match"
   SET verdict = CASE WHEN eligible THEN 'eligible'
                      WHEN breakdown->>'verdict' = 'review' THEN 'review'
                      ELSE 'not_eligible' END;
-- RoleScan has no breakdown: every non-eligible old row becomes 'not_eligible'; the next re-score (the policy change
-- re-scores all pairs anyway) fills in 'review' where it applies.
UPDATE "matches_service"."RoleScan" SET verdict = CASE WHEN eligible THEN 'eligible' ELSE 'not_eligible' END;
