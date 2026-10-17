const RULE_LABEL: Record<string, string> = {
    cgpa: 'CGPA',
    branch: 'branch',
    passingYear: 'passing year',
    backlogs: 'backlogs',
};

export function UnverifiedRulesNote({ rules, onOpenProfile }: { rules: string[]; onOpenProfile: () => void }) {
    const known = rules.filter((r) => r in RULE_LABEL);
    if (known.length === 0) return null;

    return (
        <div className="mt-3 bg-accent-soft rounded-lg px-3 py-2.5">
            <p className="text-sm text-ink">
                This role has a rule on {known.map((r) => RULE_LABEL[r]).join(', ')}, and we couldn&apos;t verify yours. You are
                still eligible for now, but the company sees it as not verified.
            </p>
            <div className="flex flex-wrap gap-3 mt-1.5">
                {known.map((r) => (
                    <button
                        key={r}
                        type="button"
                        onClick={onOpenProfile}
                        className="text-xs font-medium text-accent hover:underline"
                    >
                        Add your {RULE_LABEL[r]}
                    </button>
                ))}
            </div>
        </div>
    );
}