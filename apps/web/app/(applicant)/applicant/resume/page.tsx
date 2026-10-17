'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { getErrorMessage, isConflict } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { FadeIn } from '@/components/motion/FadeIn';
import { UploadDropzone } from '@/components/resume/UploadDropzone';
import { ResumeCard } from '@/components/resume/ResumeCard';
import { ResumeHistory } from '@/components/resume/ResumeHistory';
import type { TargetSelection } from '@/components/resume/TargetRolePicker';
import type { Resume } from '@/types/resume';
import type { UpdateResumeValues } from '@/lib/schemas/resume';

const MAX_RESUMES = 5; // contract 4.9: at most 5 non-superseded resumes

const keyOf = (r: Resume) => `${r.targetTrack}:${r.targetStack}`;

export default function ResumePage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: resumes, isLoading, isError, refetch } = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: () => apiClient.get('/resumes/mine').then((r) => r.data),
    // websocket-gateway pushes a "resume.parsed" event the moment the worker
    // finishes, so this is just a safety net in case that socket is ever down.
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'pending') ? 5000 : false),
  });

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.on('resume.parsed', () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
    });
    return () => {
      socket.off('resume.parsed');
    };
  }, [token, queryClient]);

  const uploadMutation = useMutation({
    mutationFn: ({ file, target }: { file: File; target: TargetSelection }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetTrack', target.track);
      formData.append('targetStack', target.stack);
      return apiClient.post('/resumes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume uploaded — processing started');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Upload failed, try again')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateResumeValues }) =>
      apiClient.patch(`/resumes/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume updated');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Could not save changes, try again')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/resumes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Resume deleted');
    },
    onError: (err) =>
      // 409 = an approved match still uses this resume
      toast.error(
        getErrorMessage(
          err,
          isConflict(err)
            ? "This resume is used by an approved match, so it can't be deleted."
            : 'Could not delete the resume, try again',
        ),
      ),
  });

  const sorted = [...(resumes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const current = sorted.filter((r) => !r.supersededAt);
  const replaced = sorted.filter((r) => !!r.supersededAt);
  const activeByKey = new Map(
    current.filter((r) => r.status === 'parsed' && r.confirmedAt).map((r) => [keyOf(r), r] as const),
  );
  const atLimit = current.length >= MAX_RESUMES;

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Resume</h1>
      <p className="text-sm text-ink-grey mb-6">
        Upload a resume for each kind of role you want, up to {MAX_RESUMES}. Each one is matched only with roles for its target.
      </p>

      <FadeIn>
        <UploadDropzone
          onUpload={(file, target) => uploadMutation.mutate({ file, target })}
          isUploading={uploadMutation.isPending}
          disabled={atLimit}
          disabledReason={`You already have ${MAX_RESUMES} resumes. Delete one to upload another.`}
        />
      </FadeIn>

      {isLoading && (
        <div className="mt-6 h-32 rounded-xl bg-paper-raised border border-hairline animate-pulse" />
      )}

      {isError && (
        <div className="mt-6 flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-xl px-4 py-3">
          <span>Couldn&apos;t load your resumes.</span>
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && current.length === 0 && (
        <FadeIn delay={0.05}>
          <p className="text-sm text-ink-grey mt-6">No resume uploaded yet — add one above to get started.</p>
        </FadeIn>
      )}

      {current.length > 0 && (
        <FadeIn delay={0.05}>
          <h2 className="font-heading text-lg text-ink mt-8 mb-3">
            Your resumes ({current.length} of {MAX_RESUMES})
          </h2>
          <div className="flex flex-col gap-4">
            {current.map((resume) => (
              <ResumeCard
                key={resume.id}
                resume={resume}
                replaces={!resume.confirmedAt ? activeByKey.get(keyOf(resume)) : undefined}
                isSaving={updateMutation.isPending}
                onSave={(values) => updateMutation.mutate({ id: resume.id, values })}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === resume.id}
                onDelete={() => deleteMutation.mutate(resume.id)}
              />
            ))}
          </div>
          <ResumeHistory resumes={replaced} />
        </FadeIn>
      )}
    </div>
  );
}