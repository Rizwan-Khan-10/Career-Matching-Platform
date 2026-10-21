'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { downloadCsv, toCsv, todayStamp } from '@/lib/exportCsv';
import { fetchPeople, useStagePeople, type PeopleViewer } from '@/lib/hooks/useStagePeople';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { DrawerShell } from '@/components/stats/DrawerShell';
import { PersonRow } from '@/components/stats/PersonRow';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { Drill } from '@/components/stats/stages';
import type { PersonRowData } from '@/types/stats';

const PAGE = 25;
const EXPORT_PAGE = 100;
const EXPORT_MAX = 2000;

const fullName = (p: PersonRowData) => p.name?.trim() || 'Unnamed applicant';

function csvFor(rows: PersonRowData[], viewer: PeopleViewer) {
    return toCsv(rows, [
        { header: 'Name', value: fullName },
        // emails and phones are personal data: only the admin export has them
        ...(viewer === 'admin'
            ? [
                  { header: 'Email', value: (p: PersonRowData) => p.email },
                  { header: 'Phone', value: (p: PersonRowData) => p.phone },
              ]
            : []),
        { header: 'Branch', value: (p) => p.branch },
        { header: 'CGPA', value: (p) => p.cgpa },
        { header: 'Passing year', value: (p) => p.passingYear },
        { header: 'Backlogs', value: (p) => p.backlogs },
        { header: 'Role', value: (p) => p.roleTitle },
        ...(viewer === 'admin' ? [{ header: 'Company', value: (p: PersonRowData) => p.companyName }] : []),
        { header: 'Score %', value: (p) => (p.score != null ? Math.round(p.score * 100) : null) },
        { header: 'Matched skills', value: (p) => p.matchedSkills.join('; ') },
        { header: 'Missing skills', value: (p) => p.missingSkills.join('; ') },
        { header: 'Decision', value: (p) => p.decision },
        { header: 'Scanned at', value: (p) => p.scannedAt },
        { header: 'Approved at', value: (p) => p.approvedAt },
        { header: 'Decided at', value: (p) => p.decidedAt },
    ]);
}

/** The real people behind one dashboard number: search, pages, per-person details and the resume. */
export function PeopleDrawer({ drill, viewer, onClose }: { drill: Drill | null; viewer: PeopleViewer; onClose: () => void }) {
    if (!drill) return null;
    // a different number was clicked = a different key = fresh state (page 1, empty search), no effect needed
    return <PeopleDrawerBody key={`${drill.title}|${JSON.stringify(drill.filters)}`} drill={drill} viewer={viewer} onClose={onClose} />;
}

function PeopleDrawerBody({ drill, viewer, onClose }: { drill: Drill; viewer: PeopleViewer; onClose: () => void }) {
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<'score' | 'name' | 'date'>(drill.filters.stage === 'parsed' ? 'date' : 'score');
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    const params = { ...drill.filters, q: q || undefined, page, limit: PAGE, sort };
    const { data, isLoading, isError, isFetching, refetch } = useStagePeople(viewer, params);
    const total = data?.total ?? 0;
    const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
    const to = Math.min(page * PAGE, total);
    const showRole = !drill.filters.jobRoleId && drill.filters.stage !== 'parsed';

    const exportCsv = async () => {
        setExporting(true);
        try {
            const all: PersonRowData[] = [];
            for (let pg = 1; all.length < EXPORT_MAX; pg++) {
                const res = await fetchPeople(viewer, { ...drill.filters, q: q || undefined, page: pg, limit: EXPORT_PAGE, sort });
                all.push(...res.rows);
                if (all.length >= res.total || res.rows.length === 0) break;
            }
            downloadCsv(`${drill.filters.stage}-people-${todayStamp()}.csv`, csvFor(all, viewer));
            if (viewer === 'admin') {
                // personal data left the screen: the audit log records it (best effort)
                apiClient.post('/stats/admin/people/export-log', { ...drill.filters, rows: all.length }).catch(() => undefined);
            }
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not export the list, try again'));
        } finally {
            setExporting(false);
        }
    };

    return (
        <DrawerShell
            isOpen
            onClose={onClose}
            title={`${drill.title}${data ? ` (${total})` : ''}`}
            actions={
                <button
                    type="button"
                    onClick={exportCsv}
                    disabled={exporting || total === 0}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-grey hover:text-ink hover:border-ink-grey transition-colors disabled:opacity-50"
                >
                    <Download className="size-3.5" />
                    {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
            }
        >
            <div className="p-4 grid grid-cols-[1fr_auto] gap-3 border-b border-hairline">
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={viewer === 'admin' ? 'Search name, email or branch' : 'Search name or branch'}
                    aria-label="Search this list"
                />
                <Select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} aria-label="Sort the list">
                    <option value="score">Best score</option>
                    <option value="name">Name</option>
                    <option value="date">Newest</option>
                </Select>
            </div>

            {isLoading && <div className="m-4 h-40 rounded-xl bg-paper border border-hairline animate-pulse" />}

            {isError && (
                <div className="m-4 flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-lg px-3.5 py-3">
                    <span>Couldn&apos;t load the list.</span>
                    <button type="button" onClick={() => refetch()} className="font-medium underline">Try again</button>
                </div>
            )}

            {data && (
                <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
                    {data.rows.length === 0 && (
                        <p className="text-sm text-ink-grey p-4">{q ? 'Nobody matches this search.' : 'Nobody in this list yet.'}</p>
                    )}
                    {data.rows.map((p) => (
                        <PersonRow key={`${p.applicantId}:${p.roleId ?? p.resume.resumeId ?? ''}`} person={p} viewer={viewer} showRole={showRole} />
                    ))}

                    {data.rows.length > 0 && (
                        <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-ink-grey">
                            <span>Showing {from}–{to} of {total}</span>
                            <div className="flex gap-2">
                                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-full border border-hairline hover:text-ink disabled:opacity-50">Previous</button>
                                <button type="button" disabled={to >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-full border border-hairline hover:text-ink disabled:opacity-50">Next</button>
                            </div>
                        </div>
                    )}
                    <p className="px-4 pb-4 text-xs text-ink-grey">
                        {data.distinct
                            ? 'Each person appears once, even if they were scanned for several roles.'
                            : 'A person can appear for more than one role.'}
                    </p>
                </div>
            )}
        </DrawerShell>
    );
}