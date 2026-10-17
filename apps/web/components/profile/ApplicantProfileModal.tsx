'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { applicantProfileSchema, type ApplicantProfileValues } from '@/lib/schemas/profile';
import { useApplicantProfile } from '@/lib/hooks/useApplicantProfile';
import { effectiveAcademic, type AcademicField } from '@/lib/academic';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { toast } from '@/lib/toast';
import type { Resume } from '@/types/resume';

const toNumber = (v: unknown) => (v === '' || v == null ? undefined : Number(v));
const toText = (v: unknown) => (typeof v !== 'string' || v.trim() === '' ? undefined : v);

export function ApplicantProfileModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const queryClient = useQueryClient();

    const { data: profile } = useApplicantProfile();

    // resume values are per resume; the latest confirmed one is used to show which value counts
    const { data: resumes } = useQuery<Resume[]>({
        queryKey: ['resumes'],
        queryFn: () => apiClient.get('/resumes/mine').then((r) => r.data),
    });
    const activeResume = [...(resumes ?? [])]
        .filter((r) => r.status === 'parsed' && r.confirmedAt && !r.supersededAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const effective = effectiveAcademic(profile, activeResume?.parsedData);
    const isLocked = !!profile?.academicVerified;

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
                cgpa: profile.cgpa ?? undefined,
                branch: profile.branch ?? '',
                passingYear: profile.passingYear ?? undefined,
                backlogs: profile.backlogs ?? undefined,
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
        onError: (err) => toast.error(getErrorMessage(err, 'Could not save profile')),
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

    const hint = (field: AcademicField) => {
        if (isLocked) return null;
        const item = effective[field];
        let text: string | null = null;
        if (item.source === 'resume') text = `Your resume says ${item.value}, and that takes priority over what you enter here.`;
        if (item.source === 'unknown') text = 'Not on your resume. Add it so roles with a rule on this can check you.';
        return text ? <p className="text-xs text-ink-grey mt-1">{text}</p> : null;
    };

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

                <div className="border-t border-hairline pt-3.5 mt-1">
                    <p className="text-sm font-medium text-ink">Academic details</p>
                    {isLocked ? (
                        <p className="flex items-start gap-1.5 text-xs text-ink-grey mt-1">
                            <Lock className="size-3.5 shrink-0 mt-0.5" />
                            These were added by your institution and can&apos;t be changed here.
                        </p>
                    ) : (
                        <p className="text-xs text-ink-grey mt-1">
                            Some roles have rules on these. Your resume is used first; what you enter here fills the gaps.
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">CGPA (out of 10)</label>
                        <Input
                            type="number"
                            step="0.01"
                            disabled={isLocked}
                            {...register('cgpa', { setValueAs: toNumber })}
                            placeholder="8.5"
                            className="disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <FieldError message={errors.cgpa?.message} />
                        {hint('cgpa')}
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Branch</label>
                        <Input
                            disabled={isLocked}
                            {...register('branch', { setValueAs: toText })}
                            placeholder="Computer Science"
                            className="disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <FieldError message={errors.branch?.message} />
                        {hint('branch')}
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Passing year</label>
                        <Input
                            type="number"
                            disabled={isLocked}
                            {...register('passingYear', { setValueAs: toNumber })}
                            placeholder="2026"
                            className="disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <FieldError message={errors.passingYear?.message} />
                        {hint('passingYear')}
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1 block">Backlogs</label>
                        <Input
                            type="number"
                            disabled={isLocked}
                            {...register('backlogs', { setValueAs: toNumber })}
                            placeholder="0"
                            className="disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <FieldError message={errors.backlogs?.message} />
                        {hint('backlogs')}
                    </div>
                </div>

                <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
                    {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
            </form>
        </Modal>
    );
}