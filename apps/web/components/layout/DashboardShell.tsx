import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function DashboardShell({
    role,
    children,
}: {
    role: 'ADMIN' | 'COMPANY' | 'APPLICANT';
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-paper">
            <Sidebar role={role} />
            <div className="flex-1 flex flex-col">
                <Topbar />
                <main className="flex-1 p-6">{children}</main>
            </div>
        </div>
    );
}