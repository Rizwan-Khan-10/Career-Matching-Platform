import { RequireRole } from '@/components/auth/RequireRole';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { CompanyStatusBanner } from '@/components/company/CompanyStatusBanner';

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="COMPANY">
      <DashboardShell role="COMPANY">
        <CompanyStatusBanner />
        {children}
      </DashboardShell>
    </RequireRole>
  );
}