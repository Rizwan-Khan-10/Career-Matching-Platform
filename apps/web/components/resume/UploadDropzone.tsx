'use client';

import { useRef, useState, type DragEvent } from 'react';
import { motion } from 'motion/react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import {
    EMPTY_TARGET,
    TargetRolePicker,
    isTargetComplete,
    type TargetSelection,
} from '@/components/resume/TargetRolePicker';

const MAX_SIZE_MB = 10;

export function UploadDropzone({
    onUpload,
    isUploading,
    disabled = false,
    disabledReason,
}: {
    onUpload: (file: File, target: TargetSelection) => void;
    isUploading: boolean;
    disabled?: boolean;
    disabledReason?: string;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [target, setTarget] = useState<TargetSelection>(EMPTY_TARGET);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const validateAndSet = (candidate: File | undefined | null) => {
        if (disabled || !candidate) return;
        if (candidate.type !== 'application/pdf') {
            toast.error('Only PDF resumes are supported');
            return;
        }
        if (candidate.size > MAX_SIZE_MB * 1024 * 1024) {
            toast.error(`Keep the file under ${MAX_SIZE_MB}MB`);
            return;
        }
        setFile(candidate);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        validateAndSet(e.dataTransfer.files?.[0]);
    };

    const canSubmit = !!file && isTargetComplete(target) && !disabled && !isUploading;

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <TargetRolePicker value={target} onChange={setTarget} disabled={disabled} />

            <div
                aria-disabled={disabled}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!disabled) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => {
                    if (!disabled) inputRef.current?.click();
                }}
                className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
                    disabled
                        ? 'border-hairline opacity-50 cursor-not-allowed'
                        : cn('cursor-pointer', isDragging ? 'border-accent bg-accent-soft' : 'border-hairline hover:border-ink-grey'),
                )}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    disabled={disabled}
                    onChange={(e) => validateAndSet(e.target.files?.[0])}
                    className="hidden"
                />
                <UploadCloud className="size-6 text-ink-grey" />
                <p className="text-sm text-ink font-medium">Drop your resume here, or click to browse</p>
                <p className="text-xs text-ink-grey">PDF only, up to {MAX_SIZE_MB}MB</p>
            </div>

            {file && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex items-center justify-between gap-3 mt-3 px-3 py-2.5 rounded-lg bg-paper border border-hairline"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText className="size-4 text-ink-grey shrink-0" />
                        <span className="text-sm text-ink truncate">{file.name}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setFile(null)}
                        className="text-ink-grey hover:text-ink shrink-0"
                        aria-label="Remove selected file"
                    >
                        <X className="size-4" />
                    </button>
                </motion.div>
            )}

            <Button disabled={!canSubmit} onClick={() => file && onUpload(file, target)} className="mt-4 w-full">
                {isUploading ? 'Uploading…' : 'Upload resume'}
            </Button>

            {disabled && disabledReason && <p className="text-xs text-ink-grey mt-2">{disabledReason}</p>}
            {!disabled && file && !isTargetComplete(target) && (
                <p className="text-xs text-ink-grey mt-2">Choose the role and stack above to upload.</p>
            )}
        </div>
    );
}