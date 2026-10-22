import {
    Activity,
    Bell,
    Briefcase,
    Building2,
    FileCheck,
    FileText,
    LayoutDashboard,
    MessageSquareText,
    MessagesSquare,
    ScrollText,
    Settings,
    Sparkles,
    Target,
    Upload,
    Users,
    type LucideIcon,
} from 'lucide-react';

export type NavRole = 'ADMIN' | 'COMPANY' | 'APPLICANT';

export interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    /** other path prefixes that should light this link up (e.g. the applicants page belongs to Jobs) */
    alsoMatch?: string[];
}

export interface NavGroup {
    /** small heading above the links; leave out for a single plain list */
    heading?: string;
    items: NavItem[];
}

export const NAV: Record<NavRole, NavGroup[]> = {
    APPLICANT: [
        {
            items: [
                { label: 'Dashboard', href: '/applicant/dashboard', icon: LayoutDashboard },
                { label: 'Resume', href: '/applicant/resume', icon: FileText },
                { label: 'Matches', href: '/applicant/matches', icon: Target },
                { label: 'Feedback', href: '/applicant/feedback', icon: MessageSquareText },
                { label: 'Chat', href: '/applicant/chat', icon: MessagesSquare },
                { label: 'Notifications', href: '/applicant/notifications', icon: Bell },
            ],
        },
    ],
    COMPANY: [
        {
            items: [
                { label: 'Dashboard', href: '/company/dashboard', icon: LayoutDashboard },
                { label: 'Jobs', href: '/company/jobs', icon: Briefcase, alsoMatch: ['/company/roles'] },
                { label: 'Ask AI', href: '/company/ask', icon: Sparkles },
                { label: 'Notifications', href: '/company/notifications', icon: Bell },
            ],
        },
    ],
    ADMIN: [
        { heading: 'Overview', items: [{ label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard }] },
        {
            heading: 'People',
            items: [
                { label: 'Companies', href: '/admin/companies', icon: Building2 },
                { label: 'Applicants', href: '/admin/applicants', icon: Users },
                { label: 'Import users', href: '/admin/import', icon: Upload },
            ],
        },
        { heading: 'Content', items: [{ label: 'Job approvals', href: '/admin/jobs', icon: FileCheck }] },
        {
            heading: 'System',
            items: [
                { label: 'Settings', href: '/admin/settings', icon: Settings },
                { label: 'System health', href: '/admin/health', icon: Activity },
                { label: 'Audit log', href: '/admin/audit', icon: ScrollText },
                { label: 'Notifications', href: '/admin/notifications', icon: Bell },
            ],
        },
    ],
};

export const isActive = (item: NavItem, pathname: string) =>
    [item.href, ...(item.alsoMatch ?? [])].some((base) => pathname === base || pathname.startsWith(`${base}/`));

/** The tab title for a path: "Matches · CareerMatch". Falls back to the plain app name. */
export function titleFor(role: NavRole, pathname: string): string {
    const item = NAV[role].flatMap((g) => g.items).find((i) => isActive(i, pathname));
    return item ? `${item.label} · CareerMatch` : 'CareerMatch';
}
