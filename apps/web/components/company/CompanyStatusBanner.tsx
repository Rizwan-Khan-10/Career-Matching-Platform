import { motion } from 'motion/react';
import { AlertTriangle, Clock } from 'lucide-react';

/**
 * Spec §9.2 — a self-registered company can start `pending`, and an admin can `reject` one.
 * A pending/rejected company can still log in and edit its profile but cannot upload requirement
 * docs or add roles (enforced server-side in job-service; this banner just explains why).
 */
export function CompanyStatusBanner({ status }: { status?: 'pending' | 'approved' | 'rejected' }) {
    if (status !== 'pending' && status !== 'rejected') return null;

    const isPending = status === 'pending';

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`rounded-xl px-4 py-3 mb-6 flex items-start gap-2.5 border ${isPending ? 'bg-accent-soft border-accent/20' : 'bg-danger-soft border-danger/20'
                }`}
        >
            {isPending ? (
                <Clock className="size-4 text-accent shrink-0 mt-0.5" />
            ) : (
                <AlertTriangle className="size-4 text-danger shrink-0 mt-0.5" />
            )}
            <div>
                <p className={`text-sm font-medium ${isPending ? 'text-ink' : 'text-danger'}`}>
                    {isPending ? 'Your company account is pending approval' : 'Your company account was not approved'}
                </p>
                <p className="text-xs text-ink-grey mt-0.5">
                    {isPending
                        ? 'An admin needs to approve your account before you can upload requirement docs or add roles. You can still edit your profile.'
                        : 'You cannot upload requirement docs or add roles. Contact the admin if you think this is a mistake.'}
                </p>
            </div>
        </motion.div>
    );
}
