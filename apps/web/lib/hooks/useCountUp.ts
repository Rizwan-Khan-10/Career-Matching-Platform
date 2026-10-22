'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Counts from 0 up to `target` in about 600 ms the first time, and from the old number to the new one when the data
 * refreshes. Returns null while there is no number yet. With "reduce motion" on it just returns the target.
 */
export function useCountUp(target: number | null | undefined, duration = 600): number | null {
    const reduce = useReducedMotion();
    const [value, setValue] = useState(0);
    const shown = useRef(0);

    useEffect(() => {
        if (reduce || target == null) return;
        const begin = shown.current;
        const startedAt = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const next = Math.round(begin + (target - begin) * eased);
            shown.current = next;
            setValue(next);
            if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, reduce, duration]);

    if (target == null) return null;
    return reduce ? target : value;
}
