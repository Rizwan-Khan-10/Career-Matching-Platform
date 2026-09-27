'use client';

import { Pencil } from 'lucide-react';
import type { ParsedResumeData } from '@/types/resume';

export function ResumeSummary({
    data,
    onEdit,
}: {
    data: ParsedResumeData;
    onEdit: () => void;
}) {
    const hasSkills = (data.skills?.length ?? 0) > 0;
    const hasProjects = (data.projects?.length ?? 0) > 0;

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div className="grid grid-cols-2 gap-4 text-sm flex-1">
                    <div>
                        <p className="text-xs text-ink-grey mb-0.5">Education</p>
                        <p className="text-ink">{data.education || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-ink-grey mb-0.5">CGPA</p>
                        <p className="text-ink">{data.cgpa ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-ink-grey mb-0.5">Experience</p>
                        <p className="text-ink">
                            {data.experienceYears != null ? `${data.experienceYears} yrs` : '—'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onEdit}
                    className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-ink transition-colors shrink-0"
                >
                    <Pencil className="size-3.5" />
                    Edit
                </button>
            </div>

            <div>
                <p className="text-xs text-ink-grey mb-1.5">Skills</p>
                {hasSkills ? (
                    <div className="flex flex-wrap gap-1.5">
                        {data.skills!.map((skill) => (
                            <span
                                key={skill}
                                className="bg-accent-soft text-accent text-xs font-medium px-2.5 py-1 rounded-full"
                            >
                                {skill}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-ink-grey">No skills listed yet.</p>
                )}
            </div>

            <div>
                <p className="text-xs text-ink-grey mb-1.5">Projects</p>
                {hasProjects ? (
                    <div className="space-y-3">
                        {data.projects!.map((project, i) => (
                            <div key={i} className="border-l-2 border-hairline pl-3">
                                <p className="text-sm font-medium text-ink">{project.name}</p>
                                <p className="text-sm text-ink-grey">{project.description}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-ink-grey">No projects listed yet.</p>
                )}
            </div>
        </div>
    );
}