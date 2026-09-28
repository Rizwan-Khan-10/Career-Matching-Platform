'use client';

import { useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { toast } from '@/lib/toast';

const MAX_SIZE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function AvatarUploader({
    src,
    name,
    onUpload,
    isUploading,
    size = 72,
}: {
    src?: string | null;
    name: string;
    onUpload: (file: File) => void;
    isUploading: boolean;
    size?: number;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = (file: File | undefined) => {
        if (!file) return;
        if (!ACCEPTED_TYPES.includes(file.type)) {
            toast.error('Only JPEG, PNG or WEBP images are supported');
            return;
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            toast.error(`Keep the image under ${MAX_SIZE_MB}MB`);
            return;
        }
        onUpload(file);
    };

    return (
        <div className="flex items-center gap-4">
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className="relative group rounded-full shrink-0"
                style={{ width: size, height: size }}
                aria-label="Change profile photo"
            >
                <Avatar src={src} name={name} size={size} />
                <div className="absolute inset-0 rounded-full bg-ink/0 group-hover:bg-ink/40 transition-colors flex items-center justify-center">
                    {isUploading ? (
                        <Loader2 className="size-4 text-white animate-spin" />
                    ) : (
                        <Camera className="size-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                </div>
            </button>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleChange(e.target.files?.[0])}
            />
            <div>
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={isUploading}
                    className="text-xs font-medium text-accent hover:text-ink transition-colors disabled:opacity-50"
                >
                    {isUploading ? 'Uploading…' : 'Change photo'}
                </button>
                <p className="text-xs text-ink-grey mt-0.5">JPG, PNG or WEBP, up to {MAX_SIZE_MB}MB</p>
            </div>
        </div>
    );
}