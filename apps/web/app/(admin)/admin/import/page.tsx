'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, TEMPLATE_CSV, parseImportCsv, type ParsedImport } from '@/lib/importUsers';
import { FadeIn } from '@/components/motion/FadeIn';
import { Button } from '@/components/ui/Button';
import { ImportPreviewTable } from '@/components/admin/ImportPreviewTable';
import { ImportResultView } from '@/components/admin/ImportResultView';
import type { ImportResult } from '@/types/admin';

type Stage =
  | { kind: 'idle' }
  | { kind: 'preview'; fileName: string; parsed: ParsedImport }
  | { kind: 'done'; result: ImportResult };

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'users-import-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminImportPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [fileError, setFileError] = useState<string | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const importUsers = useMutation({
    mutationFn: (users: unknown[]) =>
      apiClient.post('/auth/admin/users/import', { users }).then((r) => r.data as ImportResult),
    onSuccess: (result) => {
      setStage({ kind: 'done', result });
      queryClient.invalidateQueries({ queryKey: ['adminApplicants'] });
      queryClient.invalidateQueries({ queryKey: ['adminCompanies'] });
      toast.success(`${result.created.length} users created`);
    },
    onError: (err) => setServerError(getErrorMessage(err, 'The import failed, try again')),
  });

  const handleFile = async (file: File | undefined) => {
    setFileError(null);
    setServerError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && !file.type.includes('csv') && file.type !== 'text/plain') {
      setFileError('Please choose a .csv file.');
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setFileError('The file is larger than 1 MB. Split it into smaller files.');
      return;
    }
    const parsed = parseImportCsv(await file.text());
    if (parsed.fileError) {
      setFileError(parsed.fileError);
      return;
    }
    setErrorsOnly(false);
    setStage({ kind: 'preview', fileName: file.name, parsed });
  };

  const reset = () => {
    setStage({ kind: 'idle' });
    setFileError(null);
    setServerError(null);
  };

  const preview = stage.kind === 'preview' ? stage : null;
  const rows = preview?.parsed.rows ?? [];
  const valid = rows.filter((r) => r.user);
  const invalid = rows.filter((r) => !r.user);
  const warned = rows.filter((r) => r.user && r.warnings.length > 0);

  return (
    <div className="max-w-4xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Import users</h1>
      <p className="text-sm text-ink-grey mb-6">
        Add applicants and companies from a CSV file (up to {MAX_IMPORT_ROWS} rows). Each user gets an email with a link to set
        their password. Imported companies are approved right away, and imported academic details are locked for the applicant.
      </p>

      {stage.kind === 'done' && (
        <FadeIn>
          <ImportResultView result={stage.result} onAnother={reset} />
        </FadeIn>
      )}

      {stage.kind === 'idle' && (
        <FadeIn>
          <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <p className="text-sm font-medium text-ink mb-2">Columns</p>
            <ul className="text-xs text-ink-grey space-y-1 mb-4">
              <li><span className="font-mono text-ink">email</span> (required) and <span className="font-mono text-ink">role</span> (required: APPLICANT or COMPANY)</li>
              <li><span className="font-mono text-ink">name</span> (optional)</li>
              <li>Applicants only: <span className="font-mono text-ink">cgpa</span> (out of 10; a value above 10 is read as a percentage), <span className="font-mono text-ink">branch</span>, <span className="font-mono text-ink">passingYear</span>, <span className="font-mono text-ink">backlogs</span></li>
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose a CSV file"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = ''; // so choosing the same file again still triggers onChange
                }}
              />
              <Button type="button" onClick={() => inputRef.current?.click()}>
                <span className="inline-flex items-center gap-2">
                  <Upload className="size-4" />
                  Choose CSV file
                </span>
              </Button>
              <button type="button" onClick={downloadTemplate} className="text-sm font-medium text-accent hover:underline">
                Download template
              </button>
            </div>

            {fileError && <p className="text-sm text-danger mt-3">{fileError}</p>}
          </div>
        </FadeIn>
      )}

      {preview && (
        <FadeIn>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-ink-grey mr-1">{preview.fileName}</span>
              <span className="bg-paper-raised border border-hairline text-ink px-2.5 py-1 rounded-full">{rows.length} rows</span>
              <span className="bg-success-soft text-success px-2.5 py-1 rounded-full">{valid.length} ready</span>
              {invalid.length > 0 && <span className="bg-danger-soft text-danger px-2.5 py-1 rounded-full">{invalid.length} with errors</span>}
              {warned.length > 0 && <span className="bg-accent-soft text-accent px-2.5 py-1 rounded-full">{warned.length} with notes</span>}
            </div>

            {preview.parsed.ignoredColumns.length > 0 && (
              <p className="text-xs text-ink-grey">
                Ignored columns: {preview.parsed.ignoredColumns.join(', ')}
              </p>
            )}

            {invalid.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-ink-grey">
                <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
                Show only rows with errors
              </label>
            )}

            <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
              <ImportPreviewTable rows={errorsOnly ? invalid : rows} />
            </div>

            {invalid.length > 0 && (
              <p className="text-sm text-ink-grey">
                Rows with errors are left out. Fix them in your file and upload it again to include them: users that already
                exist are skipped, so re-importing is safe.
              </p>
            )}

            {serverError && <p className="text-sm text-danger">{serverError}</p>}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                disabled={valid.length === 0 || importUsers.isPending}
                onClick={() => {
                  setServerError(null);
                  importUsers.mutate(valid.map((r) => r.user));
                }}
              >
                {importUsers.isPending ? 'Importing…' : `Import ${valid.length} ${valid.length === 1 ? 'user' : 'users'}`}
              </Button>
              <button
                type="button"
                onClick={reset}
                disabled={importUsers.isPending}
                className="text-sm font-medium text-ink-grey hover:text-ink px-2 py-2 transition-colors disabled:opacity-50"
              >
                Choose another file
              </button>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}