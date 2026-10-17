'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Pill } from '@/components/admin/Pill';
import { UserLifecycleActions } from '@/components/admin/UserLifecycleActions';
import type { AdminCompany } from '@/types/admin';
import type { CompanyStatus } from '@/types/company';

export const COMPANIES_KEY = ['adminCompanies'] as const;
const TONE = { approved: 'success', pending: 'accent', rejected: 'danger' } as const;

export function CompanyRow({ company }: { company: AdminCompany }) {
    const queryClient = useQueryClient();
    const status: CompanyStatus = company.status ?? 'approved'; // old rows have no status
    const name = company.name || 'This company';
    const [confirmReject, setConfirmReject] = useState(false);

    // PATCH /admin/companies/:userId/status (contract 5.2): the server notifies the company and writes an audit entry
    const setStatus = useMutation({
        mutationFn: (next: CompanyStatus) =>
            apiClient.patch(`/admin/companies/${company.userId}/status`, { status: next }).then((r) => r.data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
    });

    const approve = async () => {
        try {
            await setStatus.mutateAsync('approved');
            toast.success(`${name} approved`);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not approve the company, try again'));
        }
    };

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{company.name || 'Unnamed'}</p>
                    <Pill tone={TONE[status]}>{status}</Pill>
                    {company.isActive === false && <Pill tone="muted">Deactivated</Pill>}
                </div>
                <p className="text-xs text-ink-grey truncate">{company.email || 'Email not available'}</p>
                <p className="text-xs text-ink-grey">
                    {company.industry || 'Industry not set'} · Joined {new Date(company.createdAt).toLocaleDateString()}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
                {status !== 'approved' && (
                    <button
                        type="button"
                        onClick={approve}
                        disabled={setStatus.isPending}
                        className="text-xs font-medium px-3 py-1.5 rounded-full bg-accent text-white disabled:opacity-50"
                    >
                        Approve
                    </button>
                )}
                {status !== 'rejected' && (
                    <button
                        type="button"
                        onClick={() => setConfirmReject(true)}
                        disabled={setStatus.isPending}
                        className="text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-grey hover:text-danger hover:border-danger transition-colors disabled:opacity-50"
                    >
                        {status === 'approved' ? 'Revoke approval' : 'Reject'}
                    </button>
                )}
                <UserLifecycleActions userId={company.userId} name={name} isActive={company.isActive !== false} listKey={COMPANIES_KEY} />
            </div>

            <ConfirmDialog
                open={confirmReject}
                title={status === 'approved' ? 'Revoke approval' : 'Reject company'}
                message={`${name} will not be able to upload job documents or create roles. They get a notification about this.`}
                confirmLabel={status === 'approved' ? 'Revoke approval' : 'Reject company'}
                danger
                onClose={() => setConfirmReject(false)}
                onConfirm={async () => {
                    await setStatus.mutateAsync('rejected');
                    toast.success(`${name} rejected`);
                }}
            />
        </div>
    );
}