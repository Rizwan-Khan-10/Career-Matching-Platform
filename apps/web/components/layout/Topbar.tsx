'use client';

import { Menu } from 'lucide-react';
import { useNotificationSocket } from '@/lib/hooks/useNotificationSocket';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from '@/components/ui/Logo';
import type { NavRole } from '@/lib/navItems';
import { UserMenu } from './UserMenu';

export function Topbar({ role, onMenu }: { role: NavRole; onMenu: () => void }) {
    // live notifications for every role and every page inside the dashboard shell
    useNotificationSocket();

    return (
        <header className="h-14 bg-paper-raised border-b border-hairline flex items-center gap-3 px-3 sm:px-6 sticky top-0 z-30">
            <button
                type="button"
                onClick={onMenu}
                aria-label="Open menu"
                className="lg:hidden p-2 -ml-1 rounded-lg text-ink-grey hover:text-ink hover:bg-paper transition-colors"
            >
                <Menu className="size-5" />
            </button>
            <Logo className="lg:hidden text-base" />
            <div className="flex-1" />
            <NotificationBell />
            <UserMenu role={role} />
        </header>
    );
}
