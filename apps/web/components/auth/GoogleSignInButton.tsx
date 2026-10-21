'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

interface GoogleIdApi {
    initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
    renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
}

declare global {
    interface Window {
        google?: { accounts: { id: GoogleIdApi } };
    }
}

/**
 * Render this only when the server says googleEnabled. In college mode it is never mounted,
 * so Google's script is never even requested.
 */
export function GoogleSignInButton({
    clientId,
    text,
    disabled = false,
    onCredential,
}: {
    clientId: string;
    text: 'signin_with' | 'signup_with' | 'continue_with';
    disabled?: boolean;
    onCredential: (credential: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const callbackRef = useRef(onCredential);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    // the callback is registered once with Google, so it reads the latest handler from a ref
    useEffect(() => {
        callbackRef.current = onCredential;
    });

    useEffect(() => {
        const el = containerRef.current;
        const gsi = window.google?.accounts.id;
        if (!ready || !el || !gsi) return;

        gsi.initialize({ client_id: clientId, callback: (r) => callbackRef.current(r.credential) });
        gsi.renderButton(el, {
            type: 'standard',
            theme: 'outline',
            size: 'large', // 40px, same height as the form buttons
            text,
            shape: 'rectangular',
            logo_alignment: 'center',
            width: Math.min(400, Math.max(200, el.offsetWidth)),
        });
    }, [ready, clientId, text]);

    return (
        <div>
            {/* onReady also fires when the script is already loaded (user moved from login to signup) */}
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onReady={() => setReady(true)}
                onError={() => setFailed(true)}
            />
            <div
                ref={containerRef}
                className={`flex justify-center min-h-10 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
            />
            {failed && (
                <p className="text-xs text-ink-grey mt-1">
                    Google sign-in could not load. Please use your email and password instead.
                </p>
            )}
        </div>
    );
}