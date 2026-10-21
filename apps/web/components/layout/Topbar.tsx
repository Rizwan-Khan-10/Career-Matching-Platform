'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationSocket } from '@/lib/hooks/useNotificationSocket';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SecurityModal } from '@/components/security/SecurityModal';

export function Topbar() {
    const router = useRouter();
    const logout = useAuthStore((s) => s.logout);
    const [securityOpen, setSecurityOpen] = useState(false);

    // live notifications for every role and every page inside the dashboard shell
    useNotificationSocket();

    const handleLogout = () => {
        logout();
        router.replace('/login');
    };

    return (
        <header className="h-14 bg-paper-raised border-b border-hairline flex items-center justify-end gap-3 px-6">
            <NotificationBell />
            <button
                onClick={() => setSecurityOpen(true)}
                className="flex items-center gap-1.5 text-sm font-body text-ink-grey hover:text-ink transition-colors"
            >
                <ShieldCheck className="size-4" />
                Security
            </button>
            <button
                onClick={handleLogout}
                className="text-sm font-body text-ink-grey hover:text-danger transition-colors"
            >
                Logout
            </button>
            <SecurityModal isOpen={securityOpen} onClose={() => setSecurityOpen(false)} />
        </header>
    );
}