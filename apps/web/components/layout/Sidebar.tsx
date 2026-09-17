'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const NAV_ITEMS: Record<string, { label: string; href: string }[]> = {
    APPLICANT: [
        { label: 'Dashboard', href: '/applicant/dashboard' },
        { label: 'Resume', href: '/applicant/resume' },
        { label: 'Matches', href: '/applicant/matches' },
        { label: 'Feedback', href: '/applicant/feedback' },
    ],
    COMPANY: [
        { label: 'Dashboard', href: '/company/dashboard' },
        { label: 'Jobs', href: '/company/jobs' },
    ],
    ADMIN: [
        { label: 'Dashboard', href: '/admin/dashboard' },
        { label: 'Companies', href: '/admin/companies' },
        { label: 'Applicants', href: '/admin/applicants' },
    ],
};

export function Sidebar({ role }: { role: 'ADMIN' | 'COMPANY' | 'APPLICANT' }) {
    const pathname = usePathname();
    const items = NAV_ITEMS[role] || [];

    return (
        <aside className="w-56 bg-paper-raised border-r border-hairline min-h-screen flex flex-col">
            <div className="px-5 py-6 font-heading font-bold text-lg text-ink border-b border-hairline">
                CareerMatch
            </div>
            <nav className="flex-1 px-2 py-4 flex flex-col gap-1">
                {items.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            'px-3 py-2 rounded-lg text-sm font-body transition-colors',
                            pathname === item.href
                                ? 'bg-accent-soft text-accent font-medium'
                                : 'text-ink-grey hover:bg-paper',
                        )}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>
        </aside>
    );
}