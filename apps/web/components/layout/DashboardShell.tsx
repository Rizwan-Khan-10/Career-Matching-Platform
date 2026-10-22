'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { titleFor, type NavRole } from '@/lib/navItems';
import { MobileSidebar, Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function DashboardShell({ role, children }: { role: NavRole; children: React.ReactNode }) {
    const pathname = usePathname();
    // the drawer is "open for this path": when the route changes it is closed without any effect or extra state
    const [openAt, setOpenAt] = useState<string | null>(null);
    const menuOpen = openAt === pathname;

    // one tab title per page ("Matches · CareerMatch") instead of "CareerMatch" everywhere
    useEffect(() => {
        document.title = titleFor(role, pathname);
    }, [role, pathname]);

    return (
        <div className="flex min-h-screen bg-paper">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:bg-paper-raised focus:text-ink focus:px-3 focus:py-2 focus:rounded-lg focus:shadow-lg"
            >
                Skip to content
            </a>
            <Sidebar role={role} />
            <MobileSidebar role={role} open={menuOpen} onClose={() => setOpenAt(null)} />
            <div className="flex-1 min-w-0 flex flex-col">
                <Topbar role={role} onMenu={() => setOpenAt(pathname)} />
                <main id="main" className="flex-1 p-4 sm:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
