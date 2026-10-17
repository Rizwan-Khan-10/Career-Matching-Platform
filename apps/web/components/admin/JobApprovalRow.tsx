'use client';

import { useState } from 'react';
import { RejectJobDialog } from '@/components/admin/RejectJobDialog';
import { useJobApproval } from '@/lib/hooks/useJobApproval';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';
import type { PendingJob } from '@/types/admin';

function fileLabel(fileUrl: string): string {
    const last = fileUrl.split('?')[0].split('/').pop() ?? '';
    try {
        return decodeURIComponent(last) || 'Job document';
    } catch {
        return last || 'Job document';
    }
}

export function JobApprovalRow({ job }: { job: PendingJob }) {
    const approval = useJobApproval();
    const [rejecting, setRejecting] = useState(false);
    const company = job.companyName || `Company ${job.companyId.slice(0, 8)}`;
    const openable = /^https?:\/\//i.test(job.fileUrl);

    const approve = async () => {
        try {
            await approval.mutateAsync({ id: job.id, approved: true });
            toast.success('Job approved. It will now be read and matched.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not approve the job, try again'));
        }
    };

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{company}</p>
                <p className="text-xs text-ink-grey truncate">
                    {openable ? (
                        <a href={job.fileUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            {fileLabel(job.fileUrl)}
                        </a>
                    ) : (
                        fileLabel(job.fileUrl)
                    )}
                </p>
                <p className="text-xs text-ink-grey">Submitted {new Date(job.createdAt).toLocaleString()}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={approve}
                    disabled={approval.isPending}
                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-accent text-white disabled:opacity-50"
                >
                    Approve
                </button>
                <button
                    type="button"
                    onClick={() => setRejecting(true)}
                    disabled={approval.isPending}
                    className="text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-grey hover:text-danger hover:border-danger transition-colors disabled:opacity-50"
                >
                    Reject
                </button>
            </div>

            <RejectJobDialog
                open={rejecting}
                company={company}
                onClose={() => setRejecting(false)}
                onSubmit={async (note) => {
                    await approval.mutateAsync({ id: job.id, approved: false, note });
                    toast.success('Job rejected. The company has been notified.');
                }}
            />
        </div>
    );
}