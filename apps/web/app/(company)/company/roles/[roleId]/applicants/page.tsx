'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import Link from 'next/link';
import { FadeIn } from '@/components/motion/FadeIn';
import type { ApplicantSummary, Match } from '@/types/match';

type Decision = 'shortlisted' | 'rejected';

export default function RoleApplicantsPage() {
    const params = useParams();
    const roleId = params.roleId as string;
    const token = useAuthStore((s) => s.token);
    const queryClient = useQueryClient();

    // The server only returns candidates who APPROVED sharing their resume with this company.
    const { data: matches, isLoading } = useQuery<Match[]>({
        queryKey: ['roleApplicants', roleId],
        queryFn: () => apiClient.get(`/matches/role/${roleId}`).then((r) => r.data),
        refetchInterval: (query) => (query.state.data?.some((m) => m.resumeStatus === 'none') ? 5000 : false),
    });

    // websocket-gateway pushes "candidate.ready" the moment an applicant's resume PDF has been sent
    useEffect(() => {
        if (!token) return;
        const socket = getSocket(token);
        socket.on('candidate.ready', () => {
            queryClient.invalidateQueries({ queryKey: ['roleApplicants', roleId] });
        });
        return () => {
            socket.off('candidate.ready');
        };
    }, [token, roleId, queryClient]);

    const applicantIds = Array.from(new Set((matches ?? []).map((m) => m.applicantId)));
    const { data: summaries } = useQuery<ApplicantSummary[]>({
        queryKey: ['applicantSummaries', applicantIds.join(',')],
        queryFn: () => apiClient.post('/applicants/summaries', { ids: applicantIds }).then((r) => r.data),
        enabled: applicantIds.length > 0,
    });
    const byId = new Map((summaries ?? []).map((s) => [s.userId, s]));

    const decide = useMutation({
        mutationFn: ({ id, decision }: { id: string; decision: Decision | null }) =>
            apiClient.patch(`/matches/${id}/decision`, { decision }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roleApplicants', roleId] }),
        onError: () => toast.error('Could not save your decision, try again'),
    });

    const openPdf = useMutation({
        mutationFn: async (resumeId: string) => (await apiClient.get(`/resumes/${resumeId}/pdf`)).data as { url: string; fileName: string },
        onSuccess: (data) => window.open(data.url, '_blank', 'noopener'),
        onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not open the resume, try again'),
    });

    const buttonClass = (active: boolean, tone: 'success' | 'danger') =>
        `text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${active
            ? tone === 'success'
                ? 'bg-success-soft text-success border-success'
                : 'bg-danger-soft text-danger border-danger'
            : 'border-hairline text-ink-grey hover:text-ink'
        }`;

    return (
        <div className="max-w-2xl">
            <Link href="/company/jobs" className="text-sm text-ink-grey hover:text-accent mb-2 inline-block">
                ← Back to jobs
            </Link>
            <h1 className="font-heading text-2xl text-ink mb-1">Candidates ready</h1>
            <p className="text-sm text-ink-grey mb-1 font-mono">
                {matches?.[0]?.roleTitle ? `${matches[0].roleTitle} · ` : ''}Role ID: {roleId}
            </p>
            <p className="text-sm text-ink-grey mb-6">
                These applicants matched this role and approved sharing their resume with you. You also get an email when someone approves; view and download their resume here.
            </p>

            {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

            {matches?.length === 0 && (
                <p className="text-sm text-ink-grey">
                    No candidates yet — applicants appear here as soon as they approve sharing their resume with you.
                </p>
            )}

            <div className="flex flex-col gap-3">
                {matches?.map((match, i) => {
                    const person = byId.get(match.applicantId);
                    return (
                        <FadeIn key={match.id} delay={i * 0.05}>
                            <div className="bg-paper-raised border border-hairline rounded-xl p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-ink truncate">
                                            {person?.name || `Applicant ${match.applicantId.slice(0, 8)}`}
                                        </p>
                                        {(person?.headline || person?.location) && (
                                            <p className="text-xs text-ink-grey truncate">
                                                {[person?.headline, person?.location].filter(Boolean).join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs font-medium text-success bg-success-soft px-2 py-1 rounded-full">Ready</span>
                                        <span className="text-xs font-mono text-success bg-success-soft px-2.5 py-1 rounded-full">
                                            {Math.round(match.score * 100)}%
                                        </span>
                                    </div>
                                </div>

                                {match.reason && <p className="text-sm text-ink-grey mt-2">{match.reason}</p>}

                                {(match.matchedSkills?.length ?? 0) > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {match.matchedSkills!.map((skill) => (
                                            <span key={skill} className="bg-success-soft text-success text-xs font-medium px-2 py-0.5 rounded-full">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {(match.missingSkills?.length ?? 0) > 0 && (
                                    <p className="text-xs text-ink-grey mt-2">Missing: {match.missingSkills!.join(', ')}</p>
                                )}

                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                    {match.resumeStatus === 'ready' && match.resumeId ? (
                                        <button
                                            type="button"
                                            disabled={openPdf.isPending}
                                            onClick={() => openPdf.mutate(match.resumeId!)}
                                            className="text-xs font-medium px-3 py-1.5 rounded-full bg-accent text-white disabled:opacity-50"
                                        >
                                            Download resume (PDF)
                                        </button>
                                    ) : match.resumeStatus === 'failed' ? (
                                        <span className="text-xs text-danger">Resume could not be prepared — ask the applicant to upload a PDF</span>
                                    ) : (
                                        <span className="text-xs text-ink-grey">Preparing resume PDF…</span>
                                    )}

                                    <button
                                        type="button"
                                        disabled={decide.isPending}
                                        className={buttonClass(match.decision === 'shortlisted', 'success')}
                                        onClick={() =>
                                            decide.mutate({ id: match.id, decision: match.decision === 'shortlisted' ? null : 'shortlisted' })
                                        }
                                    >
                                        Shortlist
                                    </button>
                                    <button
                                        type="button"
                                        disabled={decide.isPending}
                                        className={buttonClass(match.decision === 'rejected', 'danger')}
                                        onClick={() =>
                                            decide.mutate({ id: match.id, decision: match.decision === 'rejected' ? null : 'rejected' })
                                        }
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </FadeIn>
                    );
                })}
            </div>
        </div>
    );
}