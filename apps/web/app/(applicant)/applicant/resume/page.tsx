'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { getErrorMessage, isConflict } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { FadeIn } from '@/components/motion/FadeIn';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { FileText } from 'lucide-react';
import { UploadDropzone } from '@/components/resume/UploadDropzone';
import { ResumeCard } from '@/components/resume/ResumeCard';
import { ResumeHistory } from '@/components/resume/ResumeHistory';
import { ApplicantProfileModal } from '@/components/profile/ApplicantProfileModal';
import type { TargetSelection } from '@/components/resume/TargetRolePicker';
import type { Resume } from '@/types/resume';
import type { UpdateResumeValues } from '@/lib/schemas/resume';

const MAX_RESUMES = 5; // contract 4.9: at most 5 non-superseded resumes

const keyOf = (r: Resume) => `${r.targetTrack}:${r.targetStack}`;

export default function ResumePage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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
      setUploadProgress(0);
      return apiClient.post('/resumes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => setUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : null),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume uploaded — processing started');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Upload failed, try again')),
    onSettled: () => setUploadProgress(null),
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

  const confirmMutation = useMutation({
    mutationFn: ({ id }: { id: string; replacedLabel?: string }) =>
      apiClient.post(`/resumes/${id}/confirm`).then((r) => r.data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success(
        vars.replacedLabel
          ? `Resume confirmed — it replaced your older ${vars.replacedLabel} resume. Matching has started.`
          : 'Resume confirmed — matching has started.',
      );
    },
    // 400 here means e.g. "needs at least one skill": show the server's message
    onError: (err) => toast.error(getErrorMessage(err, 'Could not confirm the resume, try again')),
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

      <ApplicantProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      <FadeIn>
        <UploadDropzone
          onUpload={(file, target) => uploadMutation.mutate({ file, target })}
          isUploading={uploadMutation.isPending}
          progress={uploadProgress}
          disabled={atLimit}
          disabledReason={`You already have ${MAX_RESUMES} resumes. Delete one to upload another.`}
        />
      </FadeIn>

      {isLoading && <ListSkeleton rows={1} className="mt-6" />}

      {isError && <ErrorBox className="mt-6" message="Couldn't load your resumes." onRetry={() => refetch()} />}

      {!isLoading && !isError && current.length === 0 && (
        <FadeIn delay={0.05}>
          <EmptyState
            className="mt-6"
            icon={FileText}
            title="No resume yet"
            text="Choose the kind of role above and add a PDF. We read it and show you what we found."
          />
        </FadeIn>
      )}

      {current.length > 0 && (
        <FadeIn delay={0.05}>
          <h2 className="font-heading text-lg text-ink mt-8 mb-3">
            Your resumes ({current.length} of {MAX_RESUMES})
          </h2>
          <div className="flex flex-col gap-4">
            {current.map((resume) => {
              const replaces = !resume.confirmedAt ? activeByKey.get(keyOf(resume)) : undefined;
              return (
                <ResumeCard
                  key={resume.id}
                  resume={resume}
                  replaces={replaces}
                  isSaving={updateMutation.isPending}
                  onSave={(values) => updateMutation.mutate({ id: resume.id, values })}
                  isConfirming={confirmMutation.isPending && confirmMutation.variables?.id === resume.id}
                  onConfirm={() => confirmMutation.mutate({ id: resume.id, replacedLabel: replaces?.targetLabel })}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === resume.id}
                  onDelete={() => deleteMutation.mutate(resume.id)}
                  onOpenProfile={() => setIsProfileOpen(true)}
                />
              );
            })}
          </div>
          <ResumeHistory resumes={replaced} />
        </FadeIn>
      )}
    </div>
  );
}