'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobRoleSchema, type JobRoleValues } from '../../lib/schemas/job';

export function RoleForm({
  defaultValues,
  submitLabel = 'Save',
  isSaving,
  onSave,
  onCancel,
}: {
  defaultValues?: Partial<JobRoleValues>;
  submitLabel?: string;
  isSaving: boolean;
  onSave: (values: JobRoleValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JobRoleValues>({
    resolver: zodResolver(jobRoleSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-3">
      <div>
        <input
          {...register('title')}
          placeholder="Role title *"
          className="w-full text-sm border border-hairline rounded-lg px-3 py-2 bg-paper text-ink placeholder:text-ink-grey focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {errors.title && (
          <p className="text-xs text-danger mt-0.5">{errors.title.message}</p>
        )}
      </div>

      <textarea
        {...register('description')}
        placeholder="Short description (optional)"
        rows={2}
        className="w-full text-sm border border-hairline rounded-lg px-3 py-2 bg-paper text-ink placeholder:text-ink-grey focus:outline-none focus:ring-1 focus:ring-accent resize-none"
      />

      <textarea
        {...register('requirements')}
        placeholder="Requirements (optional)"
        rows={3}
        className="w-full text-sm border border-hairline rounded-lg px-3 py-2 bg-paper text-ink placeholder:text-ink-grey focus:outline-none focus:ring-1 focus:ring-accent resize-none"
      />

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-ink-grey hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="text-xs font-medium bg-ink text-paper-raised px-3 py-1.5 rounded-lg hover:bg-ink/80 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

