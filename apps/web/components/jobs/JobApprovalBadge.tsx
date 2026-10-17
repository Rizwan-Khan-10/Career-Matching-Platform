'use client';

import { Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { JobApprovalStatus } from '@/types/job';

const CONFIG: Record<Exclude<JobApprovalStatus, 'approved'>, { label: string; className: string; Icon: typeof Clock }> = {
    pending: { label: 'Awaiting admin approval', className: 'bg-accent-soft text-accent', Icon: Clock },
    rejected: { label: 'Not approved', className: 'bg-danger-soft text-danger', Icon: XCircle },
};

export function JobApprovalBadge({ status }: { status: Exclude<JobApprovalStatus, 'approved'> }) {
    const { label, className, Icon } = CONFIG[status];
    return (
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', className)}>
            <Icon className="size-3.5" />
            {label}
        </span>
    );
}