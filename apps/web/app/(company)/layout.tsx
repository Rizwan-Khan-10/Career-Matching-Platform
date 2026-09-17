import { RequireRole } from '@/components/auth/RequireRole';
import { DashboardShell } from '@/components/layout/DashboardShell';

export default function ApplicantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="COMPANY">
      <DashboardShell role="COMPANY">{children}</DashboardShell>
    </RequireRole>
  );
}