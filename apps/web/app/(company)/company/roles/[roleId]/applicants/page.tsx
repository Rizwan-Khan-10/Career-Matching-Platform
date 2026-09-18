'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import Link from 'next/link';
import { FadeIn } from '@/components/motion/FadeIn';

interface EligibleMatch {
    id: string;
    applicantId: string;
    score: number;
}

export default function RoleApplicantsPage() {
    const params = useParams();
    const roleId = params.roleId as string;

    const { data: matches, isLoading } = useQuery<EligibleMatch[]>({
        queryKey: ['roleApplicants', roleId],
        queryFn: () => apiClient.get(`/matches/role/${roleId}`).then((r) => r.data),
    });

    return (
        <div className="max-w-2xl">
            <Link href="/company/jobs" className="text-sm text-ink-grey hover:text-accent mb-2 inline-block">
                ← Back to jobs
            </Link>
            <h1 className="font-heading text-2xl text-ink mb-1">Eligible Applicants</h1>
            <p className="text-sm text-ink-grey mb-6 font-mono">Role ID: {roleId}</p>

            {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

            {matches?.length === 0 && (
                <p className="text-sm text-ink-grey">
                    No eligible applicants yet — this fills in automatically as matching completes.
                </p>
            )}

            <div className="flex flex-col gap-3">
                {matches?.map((match, i) => (
                    <FadeIn key={match.id} delay={i * 0.05}>
                        <div
                            key={match.id}
                            className="bg-paper-raised border border-hairline rounded-xl p-4 flex items-center justify-between"
                        >
                            <span className="text-sm font-mono text-ink">{match.applicantId}</span>
                            <span className="text-xs font-mono text-success bg-success-soft px-2.5 py-1 rounded-full">
                                {match.score.toFixed(2)}
                            </span>
                        </div>
                    </FadeIn>
                ))}
            </div>
        </div>
    );
}