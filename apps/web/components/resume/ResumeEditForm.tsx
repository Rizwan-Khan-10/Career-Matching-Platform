'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { SkillsInput } from '@/components/ui/SkillsInput';
import { updateResumeSchema, type UpdateResumeValues } from '@/lib/schemas/resume';
import type { AcademicField } from '@/lib/academic';
import type { ParsedResumeData } from '@/types/resume';

const LOCKED_INPUT = 'disabled:opacity-60 disabled:cursor-not-allowed';

function LockedNote({ show }: { show: boolean }) {
    return show ? <p className="text-xs text-ink-grey mt-1">Verified by your institution</p> : null;
}

export function ResumeEditForm({
    data,
    onCancel,
    onSave,
    isSaving,
    lockedFields = [],
}: {
    data: ParsedResumeData;
    onCancel: () => void;
    onSave: (values: UpdateResumeValues) => void;
    isSaving: boolean;
    /** academic fields that are verified by the institution: shown, but not editable */
    lockedFields?: AcademicField[];
}) {
    const locked = new Set<AcademicField>(lockedFields);
    const [skills, setSkills] = useState<string[]>(data.skills ?? []);
    const [education, setEducation] = useState(data.education ?? '');
    const [cgpa, setCgpa] = useState(data.cgpa != null ? String(data.cgpa) : '');
    const [experienceYears, setExperienceYears] = useState(
        data.experienceYears != null ? String(data.experienceYears) : '',
    );
    const [branch, setBranch] = useState(data.branch ?? '');
    const [passingYear, setPassingYear] = useState(data.passingYear != null ? String(data.passingYear) : '');
    const [backlogs, setBacklogs] = useState(data.backlogs != null ? String(data.backlogs) : '');
    const [projects, setProjects] = useState(data.projects ?? []);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const updateProject = (i: number, field: 'name' | 'description', value: string) => {
        setProjects((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
    };

    const removeProject = (i: number) => {
        setProjects((prev) => prev.filter((_, idx) => idx !== i));
    };

    const addProject = () => {
        setProjects((prev) => [...prev, { name: '', description: '' }]);
    };

    // empty or locked fields are left out of the request
    const numberOrUndefined = (field: AcademicField | null, raw: string) =>
        (field && locked.has(field)) || raw.trim() === '' ? undefined : Number(raw);

    const handleSave = () => {
        const parsed = updateResumeSchema.safeParse({
            skills,
            education: education.trim() || undefined,
            cgpa: numberOrUndefined('cgpa', cgpa),
            experienceYears: numberOrUndefined(null, experienceYears),
            branch: locked.has('branch') || branch.trim() === '' ? undefined : branch.trim(),
            passingYear: numberOrUndefined('passingYear', passingYear),
            backlogs: numberOrUndefined('backlogs', backlogs),
            projects,
        });

        if (!parsed.success) {
            const fieldErrors: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
                fieldErrors[issue.path[0] as string] = issue.message;
            }
            setErrors(fieldErrors);
            return;
        }
        setErrors({});
        onSave(parsed.data);
    };

    return (
        <div className="space-y-5">
            <div>
                <label className="text-xs text-ink-grey mb-1.5 block">Skills</label>
                <SkillsInput value={skills} onChange={setSkills} />
                <FieldError message={errors.skills} />
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1">
                    <label className="text-xs text-ink-grey mb-1.5 block">Education</label>
                    <Input value={education} onChange={(e) => setEducation(e.target.value)} placeholder="B.Tech, CSE" />
                    <FieldError message={errors.education} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1.5 block">CGPA</label>
                    <Input
                        type="number"
                        step="0.01"
                        value={cgpa}
                        disabled={locked.has('cgpa')}
                        className={LOCKED_INPUT}
                        onChange={(e) => setCgpa(e.target.value)}
                        placeholder="8.5"
                    />
                    <LockedNote show={locked.has('cgpa')} />
                    <FieldError message={errors.cgpa} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1.5 block">Experience (yrs)</label>
                    <Input
                        type="number"
                        step="0.5"
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(e.target.value)}
                        placeholder="1.5"
                    />
                    <FieldError message={errors.experienceYears} />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1">
                    <label className="text-xs text-ink-grey mb-1.5 block">Branch</label>
                    <Input
                        value={branch}
                        disabled={locked.has('branch')}
                        className={LOCKED_INPUT}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="Computer Science"
                    />
                    <LockedNote show={locked.has('branch')} />
                    <FieldError message={errors.branch} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1.5 block">Passing year</label>
                    <Input
                        type="number"
                        value={passingYear}
                        disabled={locked.has('passingYear')}
                        className={LOCKED_INPUT}
                        onChange={(e) => setPassingYear(e.target.value)}
                        placeholder="2026"
                    />
                    <LockedNote show={locked.has('passingYear')} />
                    <FieldError message={errors.passingYear} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1.5 block">Backlogs</label>
                    <Input
                        type="number"
                        value={backlogs}
                        disabled={locked.has('backlogs')}
                        className={LOCKED_INPUT}
                        onChange={(e) => setBacklogs(e.target.value)}
                        placeholder="0"
                    />
                    <LockedNote show={locked.has('backlogs')} />
                    <FieldError message={errors.backlogs} />
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-ink-grey">Projects</label>
                    <button
                        type="button"
                        onClick={addProject}
                        className="flex items-center gap-1 text-xs font-medium text-accent hover:text-ink transition-colors"
                    >
                        <Plus className="size-3.5" />
                        Add project
                    </button>
                </div>
                <div className="space-y-3">
                    {projects.map((project, i) => (
                        <div key={i} className="border border-hairline rounded-lg p-3 space-y-2 relative">
                            <button
                                type="button"
                                onClick={() => removeProject(i)}
                                className="absolute top-2.5 right-2.5 text-ink-grey hover:text-danger transition-colors"
                                aria-label="Remove project"
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                            <Input
                                value={project.name}
                                onChange={(e) => updateProject(i, 'name', e.target.value)}
                                placeholder="Project name"
                                className="pr-8"
                            />
                            <textarea
                                value={project.description}
                                onChange={(e) => updateProject(i, 'description', e.target.value)}
                                placeholder="Short description"
                                rows={2}
                                className="w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink placeholder:text-ink-grey outline-none transition-colors focus:border-ink resize-none"
                            />
                        </div>
                    ))}
                    {projects.length === 0 && (
                        <p className="text-sm text-ink-grey">No projects added yet.</p>
                    )}
                </div>
                <FieldError message={errors.projects} />
            </div>

            <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save changes'}
                </Button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="text-sm font-medium text-ink-grey hover:text-ink px-4 py-2.5 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}