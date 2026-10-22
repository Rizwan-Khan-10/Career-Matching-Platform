'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { SecurityModal } from '@/components/security/SecurityModal';
import { ApplicantProfileModal } from '@/components/profile/ApplicantProfileModal';
import { CompanyProfileModal } from '@/components/profile/CompanyProfileModal';
import type { NavRole } from '@/lib/navItems';

const ROLE_LABEL: Record<NavRole, string> = { ADMIN: 'Admin', COMPANY: 'Company', APPLICANT: 'Applicant' };

interface Profile {
    name?: string | null;
    avatarUrl?: string | null;
}

/** Avatar button in the top bar: name and role, Profile, Security (two-factor) and Log out. */
export function UserMenu({ role }: { role: NavRole }) {
    const router = useRouter();
    const logout = useAuthStore((s) => s.logout);
    const [open, setOpen] = useState(false);
    const [securityOpen, setSecurityOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // same query keys as the sidebar profile card, so there is no second request
    const { data: applicant } = useQuery<Profile>({
        queryKey: ['applicantProfile'],
        queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
        enabled: role === 'APPLICANT',
    });
    const { data: company } = useQuery<Profile>({
        queryKey: ['companyProfile'],
        queryFn: () => apiClient.get('/companies/me').then((r) => r.data),
        enabled: role === 'COMPANY',
    });
    const profile = role === 'APPLICANT' ? applicant : role === 'COMPANY' ? company : null;
    const name = profile?.name || (role === 'ADMIN' ? 'Administrator' : 'Your account');

    useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const handleLogout = () => {
        logout();
        router.replace('/login');
    };

    const item =
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-ink-grey hover:bg-paper hover:text-ink transition-colors';

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Account menu for ${name}`}
                className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 hover:bg-paper transition-colors"
            >
                <Avatar src={profile?.avatarUrl} name={name} size={30} />
                <span className="hidden sm:block text-sm text-ink max-w-32 truncate">{name}</span>
                <ChevronDown className="size-3.5 text-ink-grey" aria-hidden />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 mt-2 w-60 bg-paper-raised border border-hairline rounded-xl shadow-xl z-40 overflow-hidden"
                    >
                        <div className="px-3 py-3 border-b border-hairline">
                            <p className="text-sm font-medium text-ink truncate">{name}</p>
                            <p className="text-xs text-ink-grey">{ROLE_LABEL[role]}</p>
                        </div>
                        {role !== 'ADMIN' && (
                            <button
                                type="button"
                                role="menuitem"
                                className={item}
                                onClick={() => {
                                    setOpen(false);
                                    setProfileOpen(true);
                                }}
                            >
                                <UserRound className="size-4" aria-hidden /> Profile
                            </button>
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            className={item}
                            onClick={() => {
                                setOpen(false);
                                setSecurityOpen(true);
                            }}
                        >
                            <ShieldCheck className="size-4" aria-hidden /> Security (two-factor)
                        </button>
                        <button type="button" role="menuitem" className={`${item} hover:text-danger border-t border-hairline`} onClick={handleLogout}>
                            <LogOut className="size-4" aria-hidden /> Log out
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <SecurityModal isOpen={securityOpen} onClose={() => setSecurityOpen(false)} />
            {role === 'APPLICANT' && <ApplicantProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />}
            {role === 'COMPANY' && <CompanyProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />}
        </div>
    );
}
