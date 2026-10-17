'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { useDecision } from '@/lib/hooks/useDecision';
import type { DecisionBody } from '@/lib/decisions';
import { FadeIn } from '@/components/motion/FadeIn';
import { CandidateCard } from '@/components/matches/CandidateCard';
import { ShortlistModal } from '@/components/matches/ShortlistModal';
import { RejectModal } from '@/components/matches/RejectModal';
import type { ApplicantSummary, Match } from '@/types/match';

type Dialog = { kind: 'shortlist' | 'reject'; matchId: string } | null;

export default function RoleApplicantsPage() {
    const params = useParams();
    const roleId = params.roleId as string;
    const token = useAuthStore((s) => s.token);
    const queryClient = useQueryClient();
    const [dialog, setDialog] = useState<Dialog>(null);

    // The server only returns candidates who APPROVED sharing their resume with this company.
    const { data: matches, isLoading, isError, refetch } = useQuery<Match[]>({
        queryKey: ['roleApplicants', roleId],
        queryFn: () => apiClient.get(`/matches/role/${roleId}`).then((r) => r.data),
        refetchInterval: (query) => (query.state.data?.some((m) => m.resumeStatus === 'none') ? 5000 : false),
    });

    // websocket-gateway pushes "candidate.ready" the moment an applicant's resume PDF has been sent
    useEffect(() => {
        if (!token) return;
        const socket = getSocket(token);
        const refresh = () => queryClient.invalidateQueries({ queryKey: ['roleApplicants', roleId] });
        socket.on('candidate.ready', refresh);
        return () => {
            socket.off('candidate.ready', refresh);
        };
    }, [token, roleId, queryClient]);

    const applicantIds = Array.from(new Set((matches ?? []).map((m) => m.applicantId)));
    const { data: summaries } = useQuery<ApplicantSummary[]>({
        queryKey: ['applicantSummaries', applicantIds.join(',')],
        queryFn: () => apiClient.post('/applicants/summaries', { ids: applicantIds }).then((r) => r.data),
        enabled: applicantIds.length > 0,
    });
    const byId = new Map((summaries ?? []).map((s) => [s.userId, s]));
    const nameOf = (m: Match) => byId.get(m.applicantId)?.name || 'this candidate';

    const decide = useDecision(roleId);
    const dialogMatch = matches?.find((m) => m.id === dialog?.matchId) ?? null;

    // used by both modals: they show the server message inline when this throws
    const submitDecision = async (body: DecisionBody) => {
        if (!dialog) return;
        await decide.mutateAsync({ id: dialog.matchId, body });
        toast.success(
            body.decision === 'shortlisted'
                ? 'Shortlist saved — the candidate has been notified'
                : 'Rejection saved',
        );
        setDialog(null);
    };

    const clearDecision = async (match: Match) => {
        try {
            await decide.mutateAsync({ id: match.id, body: { decision: null } });
            toast.success('Decision cleared');
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not clear the decision, try again'));
        }
    };

    const openPdf = useMutation({
        mutationFn: async ({ resumeId }: { resumeId: string; popup: Window | null }) =>
            (await apiClient.get(`/resumes/${resumeId}/pdf`)).data as { url: string; fileName: string },
        onSuccess: (data, { popup }) => {
            if (popup) { popup.opener = null; popup.location.href = data.url; }
            else window.location.assign(data.url);
        },
        onError: (err: unknown, { popup }) => {
            popup?.close();
            toast.error(getErrorMessage(err, 'Could not open the resume, try again'));
        },
    });

    const shortlistedCount = matches?.filter((m) => m.decision === 'shortlisted').length ?? 0;
    const rejectedCount = matches?.filter((m) => m.decision === 'rejected').length ?? 0;
    const undecidedCount = (matches?.length ?? 0) - shortlistedCount - rejectedCount;

    return (
        <div className="max-w-2xl">
            <Link href="/company/jobs" className="text-sm text-ink-grey hover:text-accent mb-2 inline-block">
                ← Back to jobs
            </Link>
            <h1 className="font-heading text-2xl text-ink mb-1">Candidates ready</h1>
            <p className="text-sm text-ink-grey mb-1 font-mono">
                {matches?.[0]?.roleTitle ? `${matches[0].roleTitle} · ` : ''}Role ID: {roleId}
            </p>
            <p className="text-sm text-ink-grey mb-2">
                These applicants matched this role and approved sharing their resume with you. You also get an email when someone approves; view and download their resume here.
            </p>
            {matches && matches.length > 0 && (
                <p className="text-xs text-ink-grey mb-6">
                    {shortlistedCount} shortlisted · {rejectedCount} rejected · {undecidedCount} awaiting your decision
                </p>
            )}

            {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

            {isError && (
                <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-lg px-3.5 py-3">
                    <span>Couldn&apos;t load the candidates.</span>
                    <button type="button" onClick={() => refetch()} className="font-medium underline">
                        Try again
                    </button>
                </div>
            )}

            {matches?.length === 0 && (
                <p className="text-sm text-ink-grey">
                    No candidates yet — applicants appear here as soon as they approve sharing their resume with you.
                </p>
            )}

            <div className="flex flex-col gap-3">
                {matches?.map((match, i) => (
                    <FadeIn key={match.id} delay={i * 0.05}>
                        <CandidateCard
                            match={match}
                            person={byId.get(match.applicantId)}
                            busy={decide.isPending}
                            isOpeningPdf={openPdf.isPending}
                            onOpenPdf={() => {
                                const popup = window.open('about:blank', '_blank');
                                openPdf.mutate({ resumeId: match.resumeId!, popup });
                            }}
                            onShortlist={() => setDialog({ kind: 'shortlist', matchId: match.id })}
                            onReject={() => setDialog({ kind: 'reject', matchId: match.id })}
                            onClear={() => clearDecision(match)}
                        />
                    </FadeIn>
                ))}
            </div>

            <ShortlistModal
                match={dialog?.kind === 'shortlist' ? dialogMatch : null}
                candidateName={dialogMatch ? nameOf(dialogMatch) : ''}
                onClose={() => setDialog(null)}
                onSubmit={submitDecision}
            />
            <RejectModal
                match={dialog?.kind === 'reject' ? dialogMatch : null}
                candidateName={dialogMatch ? nameOf(dialogMatch) : ''}
                onClose={() => setDialog(null)}
                onSubmit={submitDecision}
            />
        </div>
    );
}