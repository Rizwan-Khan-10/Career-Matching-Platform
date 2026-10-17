'use client';

import { Download } from 'lucide-react';
import { downloadCsv, todayStamp } from '@/lib/exportCsv';

export function ExportCsvButton({
    fileName,
    disabled = false,
    build,
}: {
    fileName: string; // without the date and extension, e.g. "branch-stats"
    disabled?: boolean;
    build: () => string;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => downloadCsv(`${fileName}-${todayStamp()}.csv`, build())}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-grey hover:text-ink hover:border-ink-grey transition-colors disabled:opacity-50"
        >
            <Download className="size-3.5" />
            Export CSV
        </button>
    );
}