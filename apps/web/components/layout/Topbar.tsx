'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useNotificationSocket } from '@/lib/hooks/useNotificationSocket';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Topbar() {
    const router = useRouter();
    const logout = useAuthStore((s) => s.logout);

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
                onClick={handleLogout}
                className="text-sm font-body text-ink-grey hover:text-danger transition-colors"
            >
                Logout
            </button>
        </header>
    );
}