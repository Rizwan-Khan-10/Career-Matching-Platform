'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { applicantProfileSchema, type ApplicantProfileValues } from '@/lib/schemas/profile';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { toast } from '@/lib/toast';

interface ApplicantProfile extends ApplicantProfileValues {
    avatarUrl?: string | null;
}

export function ApplicantProfileModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const queryClient = useQueryClient();

    const { data: profile } = useQuery<ApplicantProfile>({
        queryKey: ['applicantProfile'],
        queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<ApplicantProfileValues>({ resolver: zodResolver(applicantProfileSchema) });

    useEffect(() => {
        if (profile) {
            reset({
                name: profile.name || '',
                phone: profile.phone || '',
                education: profile.education || '',
                headline: profile.headline || '',
                location: profile.location || '',
                linkedinUrl: profile.linkedinUrl || '',
            });
        }
    }, [profile, reset]);

    const saveMutation = useMutation({
        mutationFn: (values: ApplicantProfileValues) => apiClient.patch('/applicants/me', values),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['applicantProfile'] });
            toast.success('Profile updated');
            onClose();
        },
        onError: () => toast.error('Could not save profile'),
    });

    const avatarMutation = useMutation({
        mutationFn: (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            return apiClient.post('/applicants/me/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['applicantProfile'] });
            toast.success('Photo updated');
        },
        onError: () => toast.error('Could not upload photo'),
    });

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit profile">
            <div className="mb-5">
                <AvatarUploader
                    src={profile?.avatarUrl}
                    name={profile?.name || 'You'}
                    onUpload={(file) => avatarMutation.mutate(file)}
                    isUploading={avatarMutation.isPending}
                />
            </div>

            <form
                onSubmit={handleSubmit((v) => saveMutation.mutate(v))}
                className="flex flex-col gap-3.5"
            >
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Full name</label>
                    <Input {...register('name')} />
                    <FieldError message={errors.name?.message} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Headline</label>
                    <Input {...register('headline')} placeholder="e.g. Frontend Developer · 2 yrs" />
                    <FieldError message={errors.headline?.message} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Phone</label>
                        <Input {...register('phone')} />
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Location</label>
                        <Input {...register('location')} placeholder="Mumbai, IN" />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">LinkedIn</label>
                    <Input {...register('linkedinUrl')} placeholder="https://linkedin.com/in/…" />
                    <FieldError message={errors.linkedinUrl?.message} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Education</label>
                    <Input {...register('education')} placeholder="e.g. B.Tech CSE, XYZ College" />
                    <p className="text-xs text-ink-grey mt-1">
                        Detailed education, skills and projects come from your resume — this is just a quick summary.
                    </p>
                </div>

                <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
                    {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
            </form>
        </Modal>
    );
}