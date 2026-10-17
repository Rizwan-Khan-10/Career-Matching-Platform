export function SkillChips({ label, skills, className }: { label: string; skills?: string[]; className: string }) {
    if (!skills || skills.length === 0) return null;
    return (
        <div className="mt-2">
            <p className="text-xs text-ink-grey mb-1">{label}</p>
            <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                    <span key={skill} className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
                        {skill}
                    </span>
                ))}
            </div>
        </div>
    );
}