'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { JobPostingStatus } from '@/types/job';

const CONFIG: Record<JobPostingStatus, { label: string; className: string; icon: ReactNode }> = {
    pending: {
        label: 'Extracting',
        className: 'bg-accent-soft text-accent',
        icon: <Loader2 className="size-3.5 animate-spin" />,
    },
    extracted: {
        label: 'Extracted',
        className: 'bg-success-soft text-success',
        icon: <CheckCircle2 className="size-3.5" />,
    },
    failed: {
        label: 'Failed',
        className: 'bg-danger-soft text-danger',
        icon: <XCircle className="size-3.5" />,
    },
};

export function JobStatusBadge({ status }: { status: JobPostingStatus }) {
    const config = CONFIG[status] ?? CONFIG.pending;
    return (
        <motion.span
            key={status}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                config.className,
            )}
        >
            {config.icon}
            {config.label}
        </motion.span>
    );
}