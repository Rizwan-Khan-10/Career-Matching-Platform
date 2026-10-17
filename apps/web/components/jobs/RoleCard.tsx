'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { RoleForm } from './RoleForm';
import type { JobRole } from '../../types/job';
import type { JobRoleValues } from '../../lib/schemas/job';
import type { RoleStats } from '../../types/stats';

export function RoleCard({
  role,
  isSaving,
  isDeleting,
  stats,
  onSave,
  onDelete,
}: {
  role: JobRole;
  isSaving: boolean;
  isDeleting: boolean;
  stats?: RoleStats;
  onSave: (values: JobRoleValues) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="border border-dashed border-hairline rounded-lg p-3.5">
        <RoleForm
          defaultValues={{
            title: role.title,
            description: role.description,
            requirements: role.requirements,
          }}
          submitLabel="Save changes"
          onCancel={() => setIsEditing(false)}
          onSave={(values) => {
            onSave(values);
            setIsEditing(false);
          }}
          isSaving={isSaving}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-hairline px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{role.title}</p>
        {role.description && (
          <p className="text-xs text-ink-grey mt-0.5 line-clamp-2">{role.description}</p>
        )}
        {stats && (
          <div className="flex gap-3 mt-1.5 text-xs text-ink-grey">
            <span>{stats.scanned} scanned</span>
            <span>{stats.matched} matched</span>
            <span>{stats.applied} applied</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => setIsEditing(true)}
          className="text-ink-grey hover:text-ink disabled:opacity-50"
          aria-label="Edit role"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={onDelete}
          className="text-ink-grey hover:text-danger disabled:opacity-50"
          aria-label="Delete role"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

