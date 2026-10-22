/**
 * The feedback agent writes a paragraph (sometimes with "-" or "1." lines). Short bullet points are easier to scan,
 * so this splits it into lines: existing list lines stay as they are, one long paragraph is split into sentences.
 */
export function feedbackPoints(text: string | null | undefined): string[] {
    if (!text) return [];
    const lines = text
        .split(/\r?\n+/)
        .map((l) => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim())
        .filter(Boolean);
    const points = lines.length > 1 ? lines : (lines[0] ?? '').split(/(?<=[.!?])\s+(?=[A-Z])/);
    return points.map((p) => p.trim()).filter(Boolean);
}
