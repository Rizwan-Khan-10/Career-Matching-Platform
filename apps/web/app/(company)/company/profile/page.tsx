'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { companyProfileSchema, CompanyProfileValues } from '@/lib/schemas/profile';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { toast } from '@/lib/toast';
import { FadeIn } from '@/components/motion/FadeIn';

export default function CompanyProfilePage() {
    const queryClient = useQueryClient();

    const { data: profile, isLoading } = useQuery({
        queryKey: ['companyProfile'],
        queryFn: () => apiClient.get('/companies/me').then((r) => r.data),
    });

    const { register, handleSubmit, reset, formState: { errors } } = useForm<CompanyProfileValues>({
        resolver: zodResolver(companyProfileSchema),
    });

    useEffect(() => {
        if (profile) {
            reset({
                name: profile.name || '',
                industry: profile.industry || '',
                contact: profile.contact || '',
            });
        }
    }, [profile, reset]);

    const mutation = useMutation({
        mutationFn: (values: CompanyProfileValues) => apiClient.patch('/companies/me', values),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['companyProfile'] });
            toast.success('Company profile updated');
        },
        onError: () => toast.error('Could not save profile'),
    });

    if (isLoading) return <p className="text-sm text-ink-grey">Loading...</p>;

    return (
        <FadeIn>
            <div className="max-w-md">
                <h1 className="font-heading text-2xl text-ink mb-1">Company Profile</h1>
                <p className="text-sm text-ink-grey mb-6">Keep your company details up to date.</p>

                <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Company name</label>
                        <Input {...register('name')} />
                        <FieldError message={errors.name?.message} />
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Industry</label>
                        <Input {...register('industry')} placeholder="e.g. Software, Finance" />
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Contact</label>
                        <Input {...register('contact')} placeholder="Email or phone" />
                    </div>

                    <Button type="submit" disabled={mutation.isPending}>
                        {mutation.isPending ? 'Saving...' : 'Save changes'}
                    </Button>
                </form>
            </div>
        </FadeIn>
    );
}