'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { FadeIn } from '@/components/motion/FadeIn';
import { UploadDropzone } from '@/components/resume/UploadDropzone';
import { ResumeCard } from '@/components/resume/ResumeCard';
import { ResumeHistory } from '@/components/resume/ResumeHistory';
import type { Resume } from '@/types/resume';
import type { UpdateResumeValues } from '@/lib/schemas/resume';

export default function ResumePage() {
  const queryClient = useQueryClient();

  // Poll while the latest resume is still processing. There's no
  // socket/notification service wired up to push "resume.parsed" events, so
  // polling is what actually keeps this in sync with the parser worker.
  const { data: resumes, isLoading } = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: () => apiClient.get('/resumes/mine').then((r) => r.data),
    refetchInterval: (query) => (query.state.data?.[0]?.status === 'pending' ? 4000 : false),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post('/resumes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume uploaded — processing started');
    },
    onError: () => toast.error('Upload failed, try again'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateResumeValues }) =>
      apiClient.patch(`/resumes/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume updated');
    },
    onError: () => toast.error('Could not save changes, try again'),
  });

  const latest = resumes?.[0];
  const previous = resumes?.slice(1) ?? [];

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Resume</h1>
      <p className="text-sm text-ink-grey mb-6">Upload your resume to get matched against open roles.</p>

      <FadeIn>
        <UploadDropzone
          onUpload={(file) => uploadMutation.mutate(file)}
          isUploading={uploadMutation.isPending}
        />
      </FadeIn>

      {isLoading && (
        <div className="mt-6 h-32 rounded-xl bg-paper-raised border border-hairline animate-pulse" />
      )}

      {!isLoading && !latest && (
        <FadeIn delay={0.05}>
          <p className="text-sm text-ink-grey mt-6">
            No resume uploaded yet — add one above to get started.
          </p>
        </FadeIn>
      )}

      {latest && (
        <FadeIn delay={0.05}>
          <div className="mt-6">
            <ResumeCard
              resume={latest}
              isSaving={updateMutation.isPending}
              onSave={(values) => updateMutation.mutate({ id: latest.id, values })}
            />
            <ResumeHistory resumes={previous} />
          </div>
        </FadeIn>
      )}
    </div>
  );
}