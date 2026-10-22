'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { FadeIn } from '@/components/motion/FadeIn';
import { RegistrationSettingsForm } from '@/components/admin/RegistrationSettingsForm';
import type { AdminSettings } from '@/types/admin';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorBox } from '@/components/ui/ErrorBox';

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<AdminSettings>({
    queryKey: ['adminSettings'],
    queryFn: () => apiClient.get('/auth/admin/settings').then((r) => r.data),
  });

  // the form shows the server message inline when this throws
  const save = useMutation({
    mutationFn: (values: AdminSettings) => apiClient.put('/auth/admin/settings', values).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'registration-mode'] }); // the signup page reads this
      toast.success('Settings saved');
    },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Settings</h1>
      <p className="text-sm text-ink-grey mb-6">Control who can join the platform and what needs your approval.</p>

      {isLoading && <Skeleton className="h-64 rounded-xl" />}

      {isError && <ErrorBox message="Couldn't load the settings." onRetry={() => refetch()} />}

      {data && (
        <FadeIn>
          <RegistrationSettingsForm initial={data} onSave={(values) => save.mutateAsync(values)} />
        </FadeIn>
      )}
    </div>
  );
}