'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { useDecision } from '@/lib/hooks/useDecision';
import type { DecisionBody } from '@/lib/decisions';
import { FadeIn } from '@/components/motion/FadeIn';
import { LayoutGrid, Rows3, Users } from 'lucide-react';
import { ListToolbar } from '@/components/admin/ListToolbar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { CandidateTable } from '@/components/matches/CandidateTable';
import { CandidateCard } from '@/components/matches/CandidateCard';
import { ShortlistModal } from '@/components/matches/ShortlistModal';
import { RejectModal } from '@/components/matches/RejectModal';
import type { ApplicantSummary, Match } from '@/types/match';

type Dialog = { kind: 'shortlist' | 'reject'; matchId: string } | null;
type Tab = 'all' | 'awaiting' | 'shortlisted' | 'rejected';
type Sort = 'score' | 'name';
type View = 'cards' | 'table';

export default function RoleApplicantsPage() {
    const params = useParams();
    const roleId = params.roleId as string;
    const token = useAuthStore((s) => s.token);
    const queryClient = useQueryClient();
    const [dialog, setDialog] = useState<Dialog>(null);
    const [tab, setTab] = useState<Tab>('all');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<Sort>('score');
    const [view, setView] = useState<View>('cards');

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

    const openResume = (match: Match) => {
        const popup = window.open('about:blank', '_blank');
        openPdf.mutate({ resumeId: match.resumeId!, popup });
    };

    const shortlistedCount = matches?.filter((m) => m.decision === 'shortlisted').length ?? 0;
    const rejectedCount = matches?.filter((m) => m.decision === 'rejected').length ?? 0;
    const undecidedCount = (matches?.length ?? 0) - shortlistedCount - rejectedCount;

    const q = search.trim().toLowerCase();
    const shown = (matches ?? [])
        .filter((m) => {
            if (tab === 'awaiting' && m.decision) return false;
            if (tab === 'shortlisted' && m.decision !== 'shortlisted') return false;
            if (tab === 'rejected' && m.decision !== 'rejected') return false;
            if (!q) return true;
            const p = byId.get(m.applicantId);
            return `${p?.name ?? ''} ${p?.headline ?? ''} ${p?.location ?? ''}`.toLowerCase().includes(q);
        })
        .sort((a, b) =>
            sort === 'name'
                ? (byId.get(a.applicantId)?.name ?? '~').localeCompare(byId.get(b.applicantId)?.name ?? '~')
                : b.score - a.score,
        );
    const roleTitle = matches?.[0]?.roleTitle || 'This role';

    return (
        <div className="max-w-3xl">
            <Breadcrumbs
                items={[
                    { label: 'Jobs', href: '/company/jobs' },
                    { label: roleTitle, href: '/company/jobs' },
                    { label: 'Candidates' },
                ]}
            />
            <h1 className="font-heading text-2xl text-ink mb-1">Candidates ready</h1>
            <p className="text-sm text-ink-grey mb-4" title={`Role ID: ${roleId}`}>
                These applicants matched this role and approved sharing their resume with you. You also get an email when someone approves; view and download their resume here.
            </p>

            {isLoading && <ListSkeleton rows={3} />}

            {isError && <ErrorBox message="Couldn't load the candidates." onRetry={() => refetch()} />}

            {matches?.length === 0 && (
                <EmptyState
                    icon={Users}
                    title="No candidates yet"
                    text="Applicants appear here as soon as they approve sharing their resume with you."
                />
            )}

            {matches && matches.length > 0 && (
                <>
                    <ListToolbar
                        search={search}
                        onSearch={setSearch}
                        placeholder="Search by name, headline or location"
                        tabs={[
                            { id: 'all', label: 'All', count: matches.length },
                            { id: 'awaiting', label: 'Awaiting decision', count: undecidedCount },
                            { id: 'shortlisted', label: 'Shortlisted', count: shortlistedCount },
                            { id: 'rejected', label: 'Rejected', count: rejectedCount },
                        ]}
                        active={tab}
                        onTab={(id) => setTab(id as Tab)}
                    />

                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="w-44">
                            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort candidates">
                                <option value="score">Best fit first</option>
                                <option value="name">Name A to Z</option>
                            </Select>
                        </div>
                        <div className="flex rounded-lg border border-hairline overflow-hidden" role="group" aria-label="Layout">
                            {([['cards', LayoutGrid, 'Cards'], ['table', Rows3, 'Compact table']] as const).map(([id, Icon, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setView(id)}
                                    aria-pressed={view === id}
                                    aria-label={label}
                                    title={label}
                                    className={cn('p-2 transition-colors', view === id ? 'bg-accent-soft text-accent' : 'text-ink-grey hover:text-ink')}
                                >
                                    <Icon className="size-4" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {shown.length === 0 && <p className="text-sm text-ink-grey">No candidates match this filter.</p>}

                    {view === 'table' && shown.length > 0 ? (
                        <CandidateTable
                            matches={shown}
                            byId={byId}
                            busy={decide.isPending}
                            isOpeningPdf={openPdf.isPending}
                            onOpenPdf={openResume}
                            onShortlist={(m) => setDialog({ kind: 'shortlist', matchId: m.id })}
                            onReject={(m) => setDialog({ kind: 'reject', matchId: m.id })}
                        />
                    ) : (
                        <div className="flex flex-col gap-3">
                            {shown.map((match, i) => (
                                <FadeIn key={match.id} delay={Math.min(i, 10) * 0.03}>
                                    <CandidateCard
                                        match={match}
                                        person={byId.get(match.applicantId)}
                                        busy={decide.isPending}
                                        isOpeningPdf={openPdf.isPending}
                                        onOpenPdf={() => openResume(match)}
                                        onShortlist={() => setDialog({ kind: 'shortlist', matchId: match.id })}
                                        onReject={() => setDialog({ kind: 'reject', matchId: match.id })}
                                        onClear={() => clearDecision(match)}
                                    />
                                </FadeIn>
                            ))}
                        </div>
                    )}
                </>
            )}

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