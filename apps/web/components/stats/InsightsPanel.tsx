'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { DrawerShell } from '@/components/stats/DrawerShell';
import type { RoleInsights } from '@/types/stats';

/** Company, Scanned / Matched: numbers only. Those people did not approve sharing, so no names and no emails. */
export function InsightsPanel({ roleId, roleTitle, onClose }: { roleId: string | null; roleTitle: string; onClose: () => void }) {
    const { data, isLoading, isError, refetch } = useQuery<RoleInsights>({
        queryKey: ['roleInsights', roleId],
        queryFn: () => apiClient.get(`/stats/company/roles/${roleId}/insights`).then((r) => r.data),
        enabled: !!roleId,
    });
    const maxBucket = Math.max(1, ...(data?.scoreBuckets.map((b) => b.count) ?? [1]));
    const maxSkill = Math.max(1, ...(data?.topMissingSkills.map((s) => s.count) ?? [1]));

    return (
        <DrawerShell isOpen={!!roleId} onClose={onClose} title={`${roleTitle} · Scanned & matched`}>
            <div className="p-4 space-y-6">
                <p className="text-xs text-ink-grey">
                    These applicants have not approved sharing their details with you, so you only see numbers here. Names appear
                    under <span className="text-ink">Applied</span> once someone approves.
                </p>

                {isLoading && <div className="h-40 rounded-xl bg-paper border border-hairline animate-pulse" />}
                {isError && (
                    <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-lg px-3.5 py-3">
                        <span>Couldn&apos;t load the insights.</span>
                        <button type="button" onClick={() => refetch()} className="font-medium underline">Try again</button>
                    </div>
                )}

                {data && (
                    <>
                        <div className="grid grid-cols-3 gap-3">
                            {[['Scanned', data.scanned], ['Matched', data.matched], ['Not matched', data.notMatched]].map(([label, value]) => (
                                <div key={label} className="bg-paper border border-hairline rounded-xl p-3">
                                    <p className="text-xl font-heading font-bold text-ink">{value}</p>
                                    <p className="text-xs text-ink-grey">{label}</p>
                                </div>
                            ))}
                        </div>
                        {data.scanned > 0 && data.matched === 0 && (
                            <p className="text-sm text-ink bg-accent-soft rounded-lg px-3 py-2">
                                Nobody matched yet. If many people scored well but are not eligible, your requirements may be too strict.
                            </p>
                        )}

                        <section>
                            <h3 className="text-sm font-medium text-ink mb-2">Score of scanned applicants</h3>
                            <div className="space-y-1.5">
                                {data.scoreBuckets.map((b) => (
                                    <div key={b.from} className="flex items-center gap-2 text-xs">
                                        <span className="w-14 text-ink-grey font-mono">{b.from}–{b.to}%</span>
                                        <div className="flex-1 h-3 bg-paper rounded-full overflow-hidden border border-hairline">
                                            <div className="h-full bg-accent" style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                                        </div>
                                        <span className="w-8 text-right font-mono text-ink">{b.count}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h3 className="text-sm font-medium text-ink mb-2">Most common missing skills</h3>
                            {data.topMissingSkills.length === 0 ? (
                                <p className="text-xs text-ink-grey">No missing skills recorded yet.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {data.topMissingSkills.map((s) => (
                                        <div key={s.skill} className="flex items-center gap-2 text-xs">
                                            <span className="w-28 truncate text-ink" title={s.skill}>{s.skill}</span>
                                            <div className="flex-1 h-3 bg-paper rounded-full overflow-hidden border border-hairline">
                                                <div className="h-full bg-danger" style={{ width: `${(s.count / maxSkill) * 100}%` }} />
                                            </div>
                                            <span className="w-8 text-right font-mono text-ink">{s.count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section>
                            <h3 className="text-sm font-medium text-ink mb-2">By branch</h3>
                            {data.byBranch.length === 0 ? (
                                <p className="text-xs text-ink-grey">No branch data yet.</p>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-ink-grey border-b border-hairline">
                                            <th className="py-1.5 font-medium">Branch</th>
                                            <th className="py-1.5 font-medium text-right">Scanned</th>
                                            <th className="py-1.5 font-medium text-right">Matched</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.byBranch.map((b) => (
                                            <tr key={b.branch} className="border-b border-hairline last:border-0">
                                                <td className="py-1.5 text-ink">{b.branch === 'Unknown' ? 'Not specified' : b.branch}</td>
                                                <td className="py-1.5 text-right font-mono">{b.scanned}</td>
                                                <td className="py-1.5 text-right font-mono">{b.matched}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>
                    </>
                )}
            </div>
        </DrawerShell>
    );
}
