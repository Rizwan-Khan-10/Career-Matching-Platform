'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';

interface JobRole {
  id: string;
  title: string;
}

interface JobPosting {
  id: string;
  status: 'pending' | 'extracted' | 'failed';
  createdAt: string;
  roles: JobRole[];
}

export default function CompanyJobsPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const { data: postings, isLoading } = useQuery<JobPosting[]>({
    queryKey: ['jobPostings'],
    queryFn: () => apiClient.get('/jobs/mine').then((r) => r.data),
    refetchInterval: 5000, // poll every 5s since extraction happens async — swap for websocket later
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post('/jobs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['jobPostings'] });
    },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Job Postings</h1>
      <p className="text-sm text-ink-grey mb-6">
        Upload a requirement document — one file can describe multiple roles.
      </p>

      <div className="bg-paper-raised border border-hairline rounded-xl p-5 mb-6">
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm text-ink-grey mb-3 block"
        />
        <Button
          disabled={!file || uploadMutation.isPending}
          onClick={() => file && uploadMutation.mutate(file)}
        >
          {uploadMutation.isPending ? 'Uploading...' : 'Upload requirement doc'}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

      <div className="flex flex-col gap-3">
        {postings?.map((posting) => (
          <div key={posting.id} className="bg-paper-raised border border-hairline rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-ink-grey">
                {new Date(posting.createdAt).toLocaleDateString()}
              </span>
              <StatusBadge status={posting.status} />
            </div>

            {posting.status === 'pending' && (
              <p className="text-sm text-ink-grey">Extracting roles from this document...</p>
            )}

            {posting.roles?.length > 0 && (
              <ul className="flex flex-col gap-1.5 mt-2">
                {posting.roles.map((role) => (
                  <li key={role.id}>
                    <Link
                      href={`/company/roles/${role.id}/applicants`}
                      className="text-sm text-accent hover:underline"
                    >
                      {role.title} — view applicants
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-accent-soft text-accent',
    extracted: 'bg-success-soft text-success',
    failed: 'bg-danger-soft text-danger',
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${styles[status] || ''}`}>
      {status}
    </span>
  );
}