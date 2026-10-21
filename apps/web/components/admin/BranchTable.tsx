import { StageCount } from '@/components/stats/StageCount';
import type { BranchStats, PeopleStage } from '@/types/stats';

export const branchName = (b: BranchStats) => b.branch?.trim() || 'Not specified';

export function BranchTable({ rows, onOpen }: { rows: BranchStats[]; onOpen?: (row: BranchStats, stage: PeopleStage) => void }) {
    const total = rows.reduce(
        (sum, r) => ({
            scanned: sum.scanned + r.scanned,
            matched: sum.matched + r.matched,
            applied: sum.applied + r.applied,
            shortlisted: sum.shortlisted + r.shortlisted,
            rejected: sum.rejected + (r.rejected ?? 0),
        }),
        { scanned: 0, matched: 0, applied: 0, shortlisted: 0, rejected: 0 },
    );

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-xs text-ink-grey border-b border-hairline">
                        <th className="px-4 py-2.5 font-medium">Branch</th>
                        <th className="px-3 py-2.5 font-medium text-right">Scanned</th>
                        <th className="px-3 py-2.5 font-medium text-right">Matched</th>
                        <th className="px-3 py-2.5 font-medium text-right">Applied</th>
                        <th className="px-3 py-2.5 font-medium text-right">Shortlisted</th>
                        <th className="px-4 py-2.5 font-medium text-right">Rejected</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.branch ?? 'unspecified'} className="border-b border-hairline">
                            <td className="px-4 py-2.5 text-ink">{branchName(r)}</td>
                            <td className="px-3 py-2.5 text-right">{onOpen ? <StageCount value={r.scanned} stage="scanned" onOpen={() => onOpen(r, 'scanned')} /> : <span className="font-mono">{r.scanned}</span>}</td>
                            <td className="px-3 py-2.5 text-right">{onOpen ? <StageCount value={r.matched} stage="matched" onOpen={() => onOpen(r, 'matched')} /> : <span className="font-mono">{r.matched}</span>}</td>
                            <td className="px-3 py-2.5 text-right">{onOpen ? <StageCount value={r.applied} stage="applied" onOpen={() => onOpen(r, 'applied')} /> : <span className="font-mono">{r.applied}</span>}</td>
                            <td className="px-3 py-2.5 text-right">{onOpen ? <StageCount value={r.shortlisted} stage="shortlisted" onOpen={() => onOpen(r, 'shortlisted')} /> : <span className="font-mono">{r.shortlisted}</span>}</td>
                            <td className="px-4 py-2.5 text-right">{onOpen ? <StageCount value={r.rejected ?? 0} stage="rejected" onOpen={() => onOpen(r, 'rejected')} /> : <span className="font-mono">{r.rejected ?? 0}</span>}</td>
                        </tr>
                    ))}
                    <tr className="bg-paper font-medium">
                        <td className="px-4 py-2.5 text-ink">Total</td>
                        <td className="px-3 py-2.5 text-right font-mono">{total.scanned}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{total.matched}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{total.applied}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{total.shortlisted}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{total.rejected}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}