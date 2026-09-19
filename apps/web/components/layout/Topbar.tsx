'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export function Topbar() {
    const router = useRouter();
    const logout = useAuthStore((s) => s.logout);

    const handleLogout = () => {
        logout();
        router.replace('/login');
    };

    return (
        <header className="h-14 bg-paper-raised border-b border-hairline flex items-center justify-end px-6">
            <button
                onClick={handleLogout}
                className="text-sm font-body text-ink-grey hover:text-danger transition-colors"
            >
                Logout
            </button>
        </header>
    );
}