'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { Avatar } from '@/components/ui/Avatar';
import { ApplicantProfileModal } from '@/components/profile/ApplicantProfileModal';
import { CompanyProfileModal } from '@/components/profile/CompanyProfileModal';

interface ApplicantProfile {
    name?: string | null;
    headline?: string | null;
    avatarUrl?: string | null;
}

interface CompanyProfile {
    name?: string | null;
    industry?: string | null;
    avatarUrl?: string | null;
}

function ProfileCardShell({
    name,
    subtitle,
    avatarUrl,
    onEdit,
}: {
    name: string;
    subtitle: string;
    avatarUrl?: string | null;
    onEdit: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onEdit}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 border-b border-hairline text-left hover:bg-paper transition-colors group"
        >
            <Avatar src={avatarUrl} name={name} size={38} />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate">{name}</p>
                <p className="text-xs text-ink-grey truncate">{subtitle}</p>
            </div>
            <Pencil className="size-3.5 text-ink-grey opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
    );
}

export function SidebarProfileCard({ role }: { role: 'ADMIN' | 'COMPANY' | 'APPLICANT' }) {
    const [isEditing, setIsEditing] = useState(false);

    const { data: applicant } = useQuery<ApplicantProfile>({
        queryKey: ['applicantProfile'],
        queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
        enabled: role === 'APPLICANT',
    });

    const { data: company } = useQuery<CompanyProfile>({
        queryKey: ['companyProfile'],
        queryFn: () => apiClient.get('/companies/me').then((r) => r.data),
        enabled: role === 'COMPANY',
    });

    if (role === 'ADMIN') return null;

    if (role === 'APPLICANT') {
        return (
            <>
                <ProfileCardShell
                    name={applicant?.name || 'Complete your profile'}
                    subtitle={applicant?.headline || 'Add a headline'}
                    avatarUrl={applicant?.avatarUrl}
                    onEdit={() => setIsEditing(true)}
                />
                <ApplicantProfileModal isOpen={isEditing} onClose={() => setIsEditing(false)} />
            </>
        );
    }

    return (
        <>
            <ProfileCardShell
                name={company?.name || 'Complete your profile'}
                subtitle={company?.industry || 'Add your industry'}
                avatarUrl={company?.avatarUrl}
                onEdit={() => setIsEditing(true)}
            />
            <CompanyProfileModal isOpen={isEditing} onClose={() => setIsEditing(false)} />
        </>
    );
}