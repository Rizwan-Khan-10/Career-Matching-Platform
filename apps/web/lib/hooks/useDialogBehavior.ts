'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// open dialogs, newest last: Esc only closes the top one (a modal opened from a drawer closes alone)
const openStack: symbol[] = [];

/**
 * What every modal and drawer needs: Esc closes it, the page behind does not scroll, focus moves inside and stays
 * inside (Tab / Shift+Tab loop), and focus returns to the button that opened it when it closes.
 */
export function useDialogBehavior(isOpen: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!isOpen) return;
        const token = Symbol('dialog');
        openStack.push(token);
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const container = containerRef.current;
        if (container) {
            const first = container.querySelector<HTMLElement>('[autofocus], input, textarea, select');
            const target = first ?? container.querySelector<HTMLElement>(FOCUSABLE) ?? container;
            if (target === container) container.tabIndex = -1;
            target.focus({ preventScroll: true });
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (openStack[openStack.length - 1] !== token) return;
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab' || !container) return;
            const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const firstEl = items[0];
            const lastEl = items[items.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === firstEl || !container.contains(active))) {
                e.preventDefault();
                lastEl.focus();
            } else if (!e.shiftKey && (active === lastEl || !container.contains(active))) {
                e.preventDefault();
                firstEl.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            const index = openStack.indexOf(token);
            if (index >= 0) openStack.splice(index, 1);
            document.body.style.overflow = previousOverflow;
            if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
        };
    }, [isOpen, containerRef]);
}
