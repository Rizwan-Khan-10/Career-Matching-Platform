import { Button } from '@/components/ui/Button';
import type { ImportResult } from '@/types/admin';

export function ImportResultView({ result, onAnother }: { result: ImportResult; onAnother: () => void }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-success-soft rounded-xl p-4">
                    <p className="text-2xl font-heading font-bold text-success">{result.created.length}</p>
                    <p className="text-sm text-ink-grey">Users created</p>
                </div>
                <div className="bg-paper-raised border border-hairline rounded-xl p-4">
                    <p className="text-2xl font-heading font-bold text-ink">{result.skipped.length}</p>
                    <p className="text-sm text-ink-grey">Skipped</p>
                </div>
            </div>

            {result.created.length > 0 && (
                <p className="text-sm text-ink-grey">
                    Each new user gets an email with a link to set their password.
                </p>
            )}

            {result.skipped.length > 0 && (
                <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
                    <p className="text-sm font-medium text-ink px-4 py-3 border-b border-hairline">Skipped users</p>
                    <ul className="max-h-64 overflow-auto">
                        {result.skipped.map((s) => (
                            <li key={s.email} className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-hairline last:border-0">
                                <span className="text-sm text-ink break-all">{s.email}</span>
                                <span className="text-xs text-danger text-right shrink-0 max-w-[50%]">{s.reason}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <Button type="button" onClick={onAnother}>
                Import another file
            </Button>
        </div>
    );
}