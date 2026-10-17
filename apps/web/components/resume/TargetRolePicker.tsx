'use client';

import { useTargetRoles } from '@/lib/hooks/useTargetRoles';

export interface TargetSelection {
    track: string;
    stack: string;
}

export const EMPTY_TARGET: TargetSelection = { track: '', stack: '' };
export const isTargetComplete = (t: TargetSelection) => t.track !== '' && t.stack !== '';

const selectClass =
    'w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink disabled:opacity-50 disabled:cursor-not-allowed';

export function TargetRolePicker({
    value,
    onChange,
    disabled = false,
}: {
    value: TargetSelection;
    onChange: (next: TargetSelection) => void;
    disabled?: boolean;
}) {
    const { data, isLoading, isError, refetch } = useTargetRoles();

    if (isLoading) return <div className="h-20 rounded-lg bg-hairline-soft animate-pulse mb-4" />;

    if (isError || !data) {
        return (
            <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-lg px-3.5 py-3 mb-4">
                <span>Couldn&apos;t load the target roles.</span>
                <button type="button" onClick={() => refetch()} className="font-medium underline">
                    Try again
                </button>
            </div>
        );
    }

    const track = data.tracks.find((t) => t.id === value.track);
    const stacks = track?.stacks ?? [];
    const isBroad = value.track === 'other' || value.stack === 'other';

    const handleTrack = (id: string) => {
        const next = data.tracks.find((t) => t.id === id);
        // a track without stacks (e.g. "Other") has nothing to pick, so it counts as the broad "other" stack
        onChange({ track: id, stack: next && next.stacks.length === 0 ? 'other' : '' });
    };

    return (
        <div className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label htmlFor="target-track" className="block text-xs text-ink-grey mb-1">
                        Role you are applying for
                    </label>
                    <select
                        id="target-track"
                        value={value.track}
                        disabled={disabled}
                        onChange={(e) => handleTrack(e.target.value)}
                        className={selectClass}
                    >
                        <option value="">Select a role</option>
                        {data.tracks.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>

                {stacks.length > 0 || !track ? (
                    <div>
                        <label htmlFor="target-stack" className="block text-xs text-ink-grey mb-1">
                            Stack
                        </label>
                        <select
                            id="target-stack"
                            value={value.stack}
                            disabled={disabled || stacks.length === 0}
                            onChange={(e) => onChange({ track: value.track, stack: e.target.value })}
                            className={selectClass}
                        >
                            <option value="">{track ? 'Select a stack' : 'Pick a role first'}</option>
                            {stacks.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}
            </div>

            <p className="text-xs text-ink-grey mt-2">
                {!isTargetComplete(value)
                    ? 'Pick the most specific stack you can: you will only be matched with roles for it, so no unrelated matches.'
                    : isBroad
                        ? "\"Other\" turns the filter off: you'll be matched against every role, including ones that may not fit you."
                        : `You'll only be matched with ${track?.label} roles that use this stack, so you won't see unrelated matches.`}
            </p>
        </div>
    );
}