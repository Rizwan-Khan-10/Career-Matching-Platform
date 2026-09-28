'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { companyProfileSchema, type CompanyProfileValues } from '@/lib/schemas/profile';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { toast } from '@/lib/toast';

interface CompanyProfile extends CompanyProfileValues {
    avatarUrl?: string | null;
}

export function CompanyProfileModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const queryClient = useQueryClient();

    const { data: profile } = useQuery<CompanyProfile>({
        queryKey: ['companyProfile'],
        queryFn: () => apiClient.get('/companies/me').then((r) => r.data),
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<CompanyProfileValues>({ resolver: zodResolver(companyProfileSchema) });

    useEffect(() => {
        if (profile) {
            reset({
                name: profile.name || '',
                industry: profile.industry || '',
                contact: profile.contact || '',
                website: profile.website || '',
                location: profile.location || '',
                description: profile.description || '',
            });
        }
    }, [profile, reset]);

    const saveMutation = useMutation({
        mutationFn: (values: CompanyProfileValues) => apiClient.patch('/companies/me', values),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['companyProfile'] });
            toast.success('Company profile updated');
            onClose();
        },
        onError: () => toast.error('Could not save profile'),
    });

    const avatarMutation = useMutation({
        mutationFn: (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            return apiClient.post('/companies/me/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['companyProfile'] });
            toast.success('Logo updated');
        },
        onError: () => toast.error('Could not upload logo'),
    });

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit company profile">
            <div className="mb-5">
                <AvatarUploader
                    src={profile?.avatarUrl}
                    name={profile?.name || 'Company'}
                    onUpload={(file) => avatarMutation.mutate(file)}
                    isUploading={avatarMutation.isPending}
                />
            </div>

            <form
                onSubmit={handleSubmit((v) => saveMutation.mutate(v))}
                className="flex flex-col gap-3.5"
            >
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Company name</label>
                    <Input {...register('name')} />
                    <FieldError message={errors.name?.message} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Industry</label>
                        <Input {...register('industry')} placeholder="e.g. Software, Finance" />
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Location</label>
                        <Input {...register('location')} placeholder="Bengaluru, IN" />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Website</label>
                    <Input {...register('website')} placeholder="https://yourcompany.com" />
                    <FieldError message={errors.website?.message} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Contact</label>
                    <Input {...register('contact')} placeholder="Email or phone" />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">About</label>
                    <textarea
                        {...register('description')}
                        rows={3}
                        placeholder="A short line about what your company does"
                        className="w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink placeholder:text-ink-grey outline-none transition-colors focus:border-ink resize-none"
                    />
                    <FieldError message={errors.description?.message} />
                </div>

                <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
                    {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
            </form>
        </Modal>
    );
}