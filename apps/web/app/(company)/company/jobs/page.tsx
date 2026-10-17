'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { getErrorMessage, isForbidden } from '@/lib/errors';
import { useCompanyStatus } from '@/lib/hooks/useCompanyProfile';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { FadeIn } from '@/components/motion/FadeIn';
import { UploadJobDropzone } from '@/components/jobs/UploadJobDropzone';
import { JobPostingCard } from '@/components/jobs/JobPostingCard';
import type { JobPosting } from '@/types/job';
import type { JobRoleValues } from '@/lib/schemas/job';
import type { CompanyStats, RoleStats } from '@/types/stats';

export default function CompanyJobsPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const { status: companyStatus, canManage } = useCompanyStatus();
  const lockedReason =
    companyStatus === 'rejected'
      ? 'Your company was not approved, so uploads and role changes are disabled.'
      : 'Uploads and role changes unlock once an admin approves your company.';

  // show the server's message; a 403 means the company status changed, so refresh the banner and buttons too
  const handleError = (err: unknown, fallback: string) => {
    toast.error(getErrorMessage(err, fallback));
    if (isForbidden(err)) queryClient.invalidateQueries({ queryKey: ['companyProfile'] });
  };

  const { data: postings, isLoading } = useQuery<JobPosting[]>({
    queryKey: ['jobPostings'],
    queryFn: () => apiClient.get('/jobs/mine').then((r) => r.data),
    // websocket-gateway pushes "jd.extracted" the moment the agent finishes;
    // this poll is just a safety net in case that socket is ever down.
    refetchInterval: (query) =>
      query.state.data?.some((p) => p.status === 'pending') ? 15000 : false,
  });

  // scanned / matched / applied per role
  const { data: stats } = useQuery<CompanyStats>({
    queryKey: ['companyStats'],
    queryFn: () => apiClient.get('/stats/company').then((r) => r.data),
    refetchInterval: 30000,
  });
  const statsByRole: Record<string, RoleStats> = Object.fromEntries((stats?.roles ?? []).map((r) => [r.jobRoleId, r]));

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
    socket.on('jd.extracted', refresh);
    socket.on('job.approval.changed', refresh);
    return () => {
      socket.off('jd.extracted', refresh);
      socket.off('job.approval.changed', refresh);
    };
  }, [token, queryClient]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post('/jobs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
      toast.success('Requirement doc uploaded — extracting roles');
    },
    onError: (err) => handleError(err, 'Upload failed, try again'),
  });

  const addRoleMutation = useMutation({
    mutationFn: ({ postingId, values }: { postingId: string; values: JobRoleValues }) =>
      apiClient.post(`/jobs/${postingId}/roles`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
      toast.success('Role added');
    },
    onError: (err) => handleError(err, 'Could not add role, try again'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ roleId, values }: { roleId: string; values: JobRoleValues }) =>
      apiClient.patch(`/jobs/roles/${roleId}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
      toast.success('Role updated');
    },
    onError: (err) => handleError(err, 'Could not save changes, try again'),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => apiClient.delete(`/jobs/roles/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
      toast.success('Role removed');
    },
    onError: (err) => handleError(err, 'Could not remove role, try again'),
  });

  const stopMutation = useMutation({
    mutationFn: (postingId: string) => apiClient.post(`/jobs/${postingId}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
      queryClient.invalidateQueries({ queryKey: ['companyStats'] });
      toast.success('Job stopped — no more scanning or matching');
    },
    onError: (err) => handleError(err, 'Could not stop the job, try again'),
  });

  const reopenMutation = useMutation({
    mutationFn: (postingId: string) => apiClient.post(`/jobs/${postingId}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
      queryClient.invalidateQueries({ queryKey: ['companyStats'] });
      toast.success('Job reopened — matching resumes again');
    },
    onError: (err) => handleError(err, 'Could not reopen the job, try again'),
  });

  const isMutating =
    addRoleMutation.isPending ||
    updateRoleMutation.isPending ||
    deleteRoleMutation.isPending ||
    stopMutation.isPending ||
    reopenMutation.isPending;

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Job Postings</h1>
      <p className="text-sm text-ink-grey mb-6">
        Upload a requirement document — one file can describe multiple roles. You can edit or add roles anytime.
      </p>

      <FadeIn>
        <UploadJobDropzone
          onUpload={(file) => uploadMutation.mutate(file)}
          isUploading={uploadMutation.isPending}
          disabled={!canManage}
          disabledReason={lockedReason}
        />
      </FadeIn>

      {isLoading && (
        <div className="mt-6 h-32 rounded-xl bg-paper-raised border border-hairline animate-pulse" />
      )}

      {!isLoading && postings?.length === 0 && (
        <FadeIn delay={0.05}>
          <p className="text-sm text-ink-grey mt-6">
            No requirement docs uploaded yet — add one above to get started.
          </p>
        </FadeIn>
      )}

      <div className="flex flex-col gap-4 mt-6">
        {postings?.map((posting, i) => (
          <FadeIn key={posting.id} delay={i * 0.05}>
            <JobPostingCard
              posting={posting}
              isMutating={isMutating}
              canManage={canManage}
              onAddRole={(values) => addRoleMutation.mutate({ postingId: posting.id, values })}
              onUpdateRole={(roleId, values) => updateRoleMutation.mutate({ roleId, values })}
              onDeleteRole={(roleId) => deleteRoleMutation.mutate(roleId)}
              onStop={() => stopMutation.mutate(posting.id)}
              onReopen={() => reopenMutation.mutate(posting.id)}
              statsByRole={statsByRole}
            />
          </FadeIn>
        ))}
      </div>
    </div>
  );
}