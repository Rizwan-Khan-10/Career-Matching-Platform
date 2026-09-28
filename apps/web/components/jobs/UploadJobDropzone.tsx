'use client';

import { useRef, useState, type DragEvent } from 'react';
import { motion } from 'motion/react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';

const MAX_SIZE_MB = 10;
const ACCEPTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export function UploadJobDropzone({
    onUpload,
    isUploading,
}: {
    onUpload: (file: File) => void;
    isUploading: boolean;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const validateAndSet = (candidate: File | undefined | null) => {
        if (!candidate) return;
        if (!ACCEPTED_TYPES.includes(candidate.type)) {
            toast.error('Only PDF or DOCX requirement docs are supported');
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

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center cursor-pointer transition-colors',
                    isDragging ? 'border-accent bg-accent-soft' : 'border-hairline hover:border-ink-grey',
                )}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => validateAndSet(e.target.files?.[0])}
                    className="hidden"
                />
                <UploadCloud className="size-6 text-ink-grey" />
                <p className="text-sm text-ink font-medium">Drop your requirement doc here, or click to browse</p>
                <p className="text-xs text-ink-grey">PDF or DOCX, up to {MAX_SIZE_MB}MB — one doc can describe multiple roles</p>
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

            <Button
                disabled={!file || isUploading}
                onClick={() => file && onUpload(file)}
                className="mt-4 w-full"
            >
                {isUploading ? 'Uploading…' : 'Upload requirement doc'}
            </Button>
        </div>
    );
}