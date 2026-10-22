'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { NAV, isActive, type NavRole } from '@/lib/navItems';
import { Logo } from '@/components/ui/Logo';
import { useUnreadCount } from '@/lib/hooks/useNotifications';
import { SidebarProfileCard } from './SidebarProfileCard';

/** Logo, profile card and the grouped links. Used by the fixed sidebar (desktop) and the slide-in drawer (phone). */
export function SidebarNav({ role, onNavigate }: { role: NavRole; onNavigate?: () => void }) {
    const pathname = usePathname();
    const { data: unread = 0 } = useUnreadCount();

    return (
        <div className="flex flex-col h-full">
            <div className="px-5 py-5 border-b border-hairline">
                <Logo />
            </div>
            <SidebarProfileCard role={role} />
            <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-4 flex flex-col gap-4">
                {NAV[role].map((group, gi) => (
                    <div key={group.heading ?? gi}>
                        {group.heading && (
                            <p className="px-3 mb-1 text-xs font-medium uppercase tracking-wide text-ink-grey">{group.heading}</p>
                        )}
                        <div className="flex flex-col gap-0.5">
                            {group.items.map((item) => {
                                const active = isActive(item, pathname);
                                const Icon = item.icon;
                                const badge = item.href.endsWith('/notifications') ? unread : 0;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={onNavigate}
                                        aria-current={active ? 'page' : undefined}
                                        className={cn(
                                            'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors',
                                            active ? 'bg-accent-soft text-accent font-medium' : 'text-ink-grey hover:bg-paper hover:text-ink',
                                        )}
                                    >
                                        {active && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" />}
                                        <Icon className="size-4 shrink-0" aria-hidden />
                                        <span className="flex-1 truncate">{item.label}</span>
                                        {badge > 0 && (
                                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-xs font-medium leading-5 text-center">
                                                {badge > 99 ? '99+' : badge}
                                                <span className="sr-only"> unread</span>
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>
        </div>
    );
}
