# matching-agent: level-aware verdicts (eligible / review / not_eligible)

Unzip into `apps/matching-agent` (files overwrite). Then:

```powershell
$env:EMBEDDING_BACKEND="hash"
$env:APP_ENV="test"
python -m unittest discover -s tests -t . -v
python -m unittest training.test_training training.test_levels training.test_model_info training.test_data_stats
```
(PowerShell: `$env:NAME="value"`. `NAME=value python ...` works only in Linux/Mac.)

## Files
| file | what |
|---|---|
| app/services/experience.py | NEW. Company's experience rules per role: min, max, strict. Overqualified note. Unknown experience never rejects |
| app/services/scorer.py | `judge()` -> verdict; `threshold(level)`, `review_lower(level)`, `policy_key()`; `apply_gates` uses experience.py; `decide()` kept |
| app/services/matcher.py | `MatchResult.verdict`, reasons for "possible match", breakdown: verdict, reviewLower, experienceRules, experienceUnverified, overqualified |
| app/services/input_hash.py | `policy` argument (fixes the `iif` typo too) |
| app/services/selection.py | review pairs published (own cap) |
| app/services/retrieval.py | best resume per applicant: eligible > review > not eligible |
| app/services/scan_report.py | `verdict` key in match.scanned |
| app/models/matching.py | `verdict` in match.computed |
| app/workers/stream_consumer.py | passes `policy`, `verdict`, review cap |
| app/main.py | GET /model shows per-level bars, review band, policy key |
| app/core/config.py | new settings (below) |
| training/train.py | `--levels`, `--base-only` |
| training/evaluate.py | verdict-wise + level-wise report (review band quality) |
| training/model_info.py | new settings listed in MODEL_INFO.md |
| tests/test_experience.py, tests/test_verdicts.py, training/test_levels.py | NEW tests (test_verdicts.py replaces any old file with that name) |

## New env (all optional; add to .env.example)
```
ELIGIBILITY_THRESHOLD=0.40
# FRESHER_ELIGIBILITY_THRESHOLD=      # empty = same as above
REVIEW_BAND_WIDTH=0.10                # review = [threshold - width, threshold). 0 = review band off
MAX_REVIEW_PER_RESUME=20
MAX_REVIEW_PER_ROLE=20
OVERQUALIFIED_EXTRA_YEARS=5
```

## Role fields the agent now reads from role.requirements (all optional)
- `minExperienceYears` (as before), `maxExperienceYears` (null/missing = no limit), `strictMinExperience` (true = below min is a hard reject).
- jobs-service does not send max/strict yet; until it does, nothing changes for existing roles.

## Verdicts
- `eligible`: probability >= threshold and no gate failed.
- `review` ("possible match"): no gate failed and probability in [threshold - width, threshold), or eligible by score but the experience the role asks for is unknown.
- `not_eligible`: a hard gate failed (skills coverage < 35%, above company max, below min when strict / far below min, campus rules) or probability below the band.
- `eligible` (bool) stays True ONLY for verdict `eligible`, so matching-results-service / UI keep working unchanged. Review pairs are saved as not eligible, with `breakdown.verdict = "review"`. They become visible to companies when results-service / UI (plan C9, C10) read the verdict.
- The first run after deploy re-scores every pair once (policy key joined the input hash).

## Training
```powershell
# experienced-only model, 14 base features (fresher features use the interim weights)
python -m training.train --real training/data/real_pairs.jsonl --levels experienced --base-only --beta 0.5
python -m training.evaluate --data training/data/real_pairs.jsonl --beta 0.5
python -m training.model_info --note "experienced-only, base features"
```
Do NOT paste secrets or keys anywhere. Existing scorer.json keeps working (version unchanged) until you retrain.
