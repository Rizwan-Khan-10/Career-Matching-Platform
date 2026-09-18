'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/queryClient';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--color-paper-raised)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-hairline)',
            borderRadius: '10px',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
          },
        }}
      />
    </QueryClientProvider>
  );
}