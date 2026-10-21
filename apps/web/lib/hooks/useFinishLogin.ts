'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { decodeJwtPayload } from '@/lib/jwt';
import { toast } from '@/lib/toast';
import type { TokenResponse } from '@/types/auth';

/** Stores the tokens and sends the user to their dashboard. Returns false when the token is unreadable. */
export function useFinishLogin() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  return (res: TokenResponse): boolean => {
    const payload = decodeJwtPayload(res.accessToken);
    if (!payload) return false;

    setAuth(res.accessToken, res.role, payload.sub, res.refreshToken);

    if (res.recoveryCodesLeft !== undefined && res.recoveryCodesLeft <= 3) {
      toast.warning(
        res.recoveryCodesLeft === 0
          ? 'You have used all your recovery codes. Make new ones in Security.'
          : `Only ${res.recoveryCodesLeft} recovery code${res.recoveryCodesLeft === 1 ? '' : 's'} left. Make new ones in Security.`,
      );
    }

    if (res.role === 'APPLICANT') router.push('/applicant/dashboard');
    else if (res.role === 'COMPANY') router.push('/company/dashboard');
    else router.push('/admin/dashboard');
    return true;
  };
}