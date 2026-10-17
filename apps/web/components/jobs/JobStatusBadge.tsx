'use client';

const STATUS_MAP: Record<string, { label: string; classes: string }> = {
  pending: {
    label: 'Extracting roles…',
    classes: 'bg-accent-soft text-accent border-accent/20',
  },
  ready: {
    label: 'Active',
    classes: 'bg-success-soft text-success border-success/20',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-danger-soft text-danger border-danger/20',
  },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    classes: 'bg-paper text-ink-grey border-hairline',
  };

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

