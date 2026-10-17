import { cn } from '@/lib/cn';
import { IMPORT_COLUMNS, type ImportRow } from '@/lib/importUsers';

const HEAD: Record<(typeof IMPORT_COLUMNS)[number], string> = {
    email: 'Email',
    role: 'Role',
    name: 'Name',
    cgpa: 'CGPA',
    branch: 'Branch',
    passingYear: 'Year',
    backlogs: 'Backlogs',
};

export function ImportPreviewTable({ rows }: { rows: ImportRow[] }) {
    if (rows.length === 0) return <p className="text-sm text-ink-grey p-4">No rows to show.</p>;

    return (
        <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
                <thead className="sticky top-0 bg-paper-raised">
                    <tr className="text-left text-xs text-ink-grey border-b border-hairline">
                        <th className="px-3 py-2 font-medium">Row</th>
                        {IMPORT_COLUMNS.map((c) => (
                            <th key={c} className="px-3 py-2 font-medium">
                                {HEAD[c]}
                            </th>
                        ))}
                        <th className="px-3 py-2 font-medium">Check</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.line} className={cn('border-b border-hairline last:border-0 align-top', row.errors.length > 0 && 'bg-danger-soft/50')}>
                            <td className="px-3 py-2 font-mono text-xs text-ink-grey">{row.line}</td>
                            {IMPORT_COLUMNS.map((c) => (
                                <td key={c} className="px-3 py-2 text-ink whitespace-nowrap max-w-[14rem] truncate" title={row.values[c]}>
                                    {row.values[c] || <span className="text-ink-grey">—</span>}
                                </td>
                            ))}
                            <td className="px-3 py-2 min-w-[14rem]">
                                {row.errors.length === 0 && row.warnings.length === 0 && (
                                    <span className="text-xs font-medium text-success">OK</span>
                                )}
                                {row.errors.map((message) => (
                                    <p key={message} className="text-xs text-danger">
                                        {message}
                                    </p>
                                ))}
                                {row.warnings.map((message) => (
                                    <p key={message} className="text-xs text-accent">
                                        {message}
                                    </p>
                                ))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}