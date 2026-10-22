import { StatsTable, stageColumns, type StatsColumn } from '@/components/stats/StatsTable';
import type { BranchStats, PeopleStage } from '@/types/stats';

export const branchName = (b: BranchStats) => b.branch?.trim() || 'Not specified';

export function BranchTable({ rows, onOpen }: { rows: BranchStats[]; onOpen?: (row: BranchStats, stage: PeopleStage) => void }) {
    const columns: StatsColumn<BranchStats>[] = [
        { key: 'branch', header: 'Branch', cell: (r) => <span className="text-ink">{branchName(r)}</span> },
        ...stageColumns<BranchStats>(onOpen),
    ];
    return <StatsTable rows={rows} columns={columns} getKey={(r) => r.branch ?? 'unspecified'} caption="Applicants by branch" />;
}
