import type { Match } from '@/types/match';

/**
 * Where "reason" comes from (matching-agent, matcher.py): "Covers 3 of 5 required skills; match probability 82%.",
 * "Not eligible: CGPA 6.1 is below 7.0." or "Not eligible: Covers 2 of 5 required skills; match probability 31% is below the 50% bar.
 * Missing: React, SQL." and "Possible match, needs a review: ...". The skills are shown as chips, and "match probability" means
 * little to a student, so this turns the engine sentence into plain words.
 */
export function plainReason(reason: string | null | undefined): string {
    if (!reason) return '';
    return reason
        .replace(/\s*Missing:[^.]*\./g, '') // the missing skills are chips under the sentence
        .replace(/;?\s*match probability \d+%\s+is (?:just )?below the \d+% bar/gi, ', but the overall fit is below what this role needs')
        .replace(/\s*Match probability \d+% is just below the \d+% bar\./gi, ' The overall fit is just below what this role needs.')
        .replace(/;?\s*match probability \d+%/gi, '')
        .replace(/\s+,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export type MatchGroup = 'eligible' | 'almost' | 'not_eligible';

/**
 * The API does not send the engine's verdict, but a "needs a review" result is not eligible and its reason starts with
 * "Possible match". That is what we call "almost eligible".
 */
export function matchGroup(match: Pick<Match, 'eligible' | 'reason'>): MatchGroup {
    if (match.eligible) return 'eligible';
    return /^possible match/i.test(match.reason ?? '') ? 'almost' : 'not_eligible';
}
