'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { FadeIn } from '@/components/motion/FadeIn';
import { motion } from 'motion/react';

interface Resume {
  id: string;
  status: 'pending' | 'parsed' | 'failed';
  fileUrl: string;
  parsedData: any;
  createdAt: string;
}

export default function ResumePage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const { data: resumes } = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: () => apiClient.get('/resumes/mine').then((r) => r.data),
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
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume uploaded — processing started');
    },
    onError: () => toast.error('Upload failed, try again'),
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

  const latest = resumes?.[0];

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Resume</h1>
      <p className="text-sm text-ink-grey mb-6">Upload your resume to get matched against open roles.</p>

      <FadeIn>
        <div className="bg-paper-raised border border-hairline rounded-xl p-5 mb-6">
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm text-ink-grey mb-3 block"
          />
          <Button
            disabled={!file || uploadMutation.isPending}
            onClick={() => file && uploadMutation.mutate(file)}
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload resume'}
          </Button>
        </div>
      </FadeIn>

      {latest && (
        <FadeIn delay={0.05}>
          <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-ink">Latest resume</span>
              <StatusBadge status={latest.status} />
            </div>

            {latest.status === 'pending' && (
              <p className="text-sm text-ink-grey">Processing your resume — this updates automatically.</p>
            )}

            {latest.status === 'parsed' && latest.parsedData && (
              <div className="text-sm text-ink-grey space-y-2">
                <p><span className="text-ink font-medium">Skills:</span> {latest.parsedData.skills?.join(', ')}</p>
                <p><span className="text-ink font-medium">Education:</span> {latest.parsedData.education}</p>
                <p><span className="text-ink font-medium">CGPA:</span> {latest.parsedData.cgpa ?? '—'}</p>
              </div>
            )}
          </div>
        </FadeIn>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-accent-soft text-accent',
    parsed: 'bg-success-soft text-success',
    failed: 'bg-danger-soft text-danger',
  };
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`text-xs font-medium px-2.5 py-1 rounded-full ${styles[status] || ''}`}
    >
      {status}
    </motion.span>
  );
}