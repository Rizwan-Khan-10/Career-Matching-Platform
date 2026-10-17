'use client';

import { useTargetRoles } from '@/lib/hooks/useTargetRoles';
import { stackLabel } from '@/lib/targetRoles';
import { cn } from '@/lib/cn';

const selectClass =
    'w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink';

export function RoleStackPicker({
    track,
    stacks,
    onChange,
}: {
    track: string; // '' = no filter
    stacks: string[];
    onChange: (next: { track: string; stacks: string[] }) => void;
}) {
    const { data, isLoading, isError, refetch } = useTargetRoles();

    if (isLoading) return <div className="h-20 rounded-lg bg-hairline-soft animate-pulse" />;

    if (isError || !data) {
        return (
            <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-lg px-3.5 py-3">
                <span>Couldn&apos;t load the target roles.</span>
                <button type="button" onClick={() => refetch()} className="font-medium underline">
                    Try again
                </button>
            </div>
        );
    }

    const current = data.tracks.find((t) => t.id === track);
    // "other" as a stack means "applicant opted out of filtering", it makes no sense as a requirement
    const options = (current?.stacks ?? []).filter((s) => s.id !== 'other');
    // keep ids that are already saved but missing from the taxonomy, so they can still be unselected
    const extras = stacks.filter((id) => !options.some((o) => o.id === id)).map((id) => ({ id, label: stackLabel(id) }));
    const selectable = [...options, ...extras];
    const showStacks = !!current && current.id !== 'other' && selectable.length > 0;

    const toggle = (id: string) =>
        onChange({ track, stacks: stacks.includes(id) ? stacks.filter((s) => s !== id) : [...stacks, id] });

    return (
        <div className="space-y-3">
            <div>
                <label htmlFor="role-track" className="text-xs text-ink-grey mb-1.5 block">
                    Role track
                </label>
                <select
                    id="role-track"
                    value={track}
                    onChange={(e) => onChange({ track: e.target.value, stacks: [] })}
                    className={selectClass}
                >
                    <option value="">No filter (match every applicant)</option>
                    {data.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>

            {showStacks && (
                <div>
                    <span className="text-xs text-ink-grey mb-1.5 block">Stacks</span>
                    <div className="flex flex-wrap gap-1.5">
                        {selectable.map((s) => {
                            const active = stacks.includes(s.id);
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => toggle(s.id)}
                                    className={cn(
                                        'text-xs font-medium px-2.5 py-1 rounded-full border transition-colors',
                                        active
                                            ? 'bg-accent-soft text-accent border-accent'
                                            : 'bg-paper-raised text-ink-grey border-hairline hover:text-ink',
                                    )}
                                >
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <p className="text-xs text-ink-grey">
                {track === ''
                    ? 'Pick a track to match only applicants who target that kind of role. Leave it empty to match everyone.'
                    : track === 'other'
                      ? '"Other" turns the filter off: every applicant can be matched with this role.'
                      : stacks.length === 0
                        ? 'Choose the stack(s) you really need. Only applicants whose resume targets one of them are matched; leave all unselected to accept any stack in this track.'
                        : 'Only applicants whose resume targets one of these stacks (or who chose "Other") are matched with this role.'}
            </p>
        </div>
    );
}