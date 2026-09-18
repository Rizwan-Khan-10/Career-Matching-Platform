'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { applicantProfileSchema, ApplicantProfileValues } from '@/lib/schemas/profile';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';

export default function ApplicantProfilePage() {
    const queryClient = useQueryClient();

    const { data: profile, isLoading } = useQuery({
        queryKey: ['applicantProfile'],
        queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
    });

    const { register, handleSubmit, reset, formState: { errors } } = useForm<ApplicantProfileValues>({
        resolver: zodResolver(applicantProfileSchema),
    });

    useEffect(() => {
        if (profile) {
            reset({
                name: profile.name || '',
                phone: profile.phone || '',
                education: profile.education || '',
            });
        }
    }, [profile, reset]);

    const mutation = useMutation({
        mutationFn: (values: ApplicantProfileValues) => apiClient.patch('/applicants/me', values),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['applicantProfile'] });
        },
    });

    if (isLoading) return <p className="text-sm text-ink-grey">Loading...</p>;

    return (
        <div className="max-w-md">
            <h1 className="font-heading text-2xl text-ink mb-1">Profile</h1>
            <p className="text-sm text-ink-grey mb-6">Keep your details up to date.</p>

            <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Full name</label>
                    <Input {...register('name')} />
                    <FieldError message={errors.name?.message} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Phone</label>
                    <Input {...register('phone')} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1 block">Education</label>
                    <Input {...register('education')} placeholder="e.g. B.Tech CSE, XYZ College" />
                </div>

                <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Saving...' : 'Save changes'}
                </Button>
                {mutation.isSuccess && <p className="text-sm text-success">Saved.</p>}
            </form>
        </div>
    );
}