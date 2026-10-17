'use client';

import { motion } from 'motion/react';
import { Clock, XCircle } from 'lucide-react';
import { useCompanyStatus } from '@/lib/hooks/useCompanyProfile';

export function CompanyStatusBanner() {
    const { status } = useCompanyStatus();
    if (status === 'approved') return null;

    const isPending = status === 'pending';
    const Icon = isPending ? Clock : XCircle;

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            role="status"
            className={
                isPending
                    ? 'max-w-3xl flex items-start gap-3 bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 mb-6'
                    : 'max-w-3xl flex items-start gap-3 bg-danger-soft border border-danger/20 rounded-xl px-4 py-3 mb-6'
            }
        >
            <Icon className={isPending ? 'size-4 shrink-0 mt-0.5 text-accent' : 'size-4 shrink-0 mt-0.5 text-danger'} />
            <div>
                <p className={isPending ? 'text-sm font-medium text-ink' : 'text-sm font-medium text-danger'}>
                    {isPending ? 'Your company is waiting for admin approval' : 'Your company was not approved'}
                </p>
                <p className="text-sm text-ink-grey mt-0.5">
                    {isPending
                        ? 'You can look around, but uploading requirement documents and adding roles unlock once an admin approves your account.'
                        : 'Uploading requirement documents and adding roles are disabled. Please contact your administrator.'}
                </p>
            </div>
        </motion.div>
    );
}