'use client';

import { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/cn';

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'ref'>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, children, ...props }, ref) => (
        <motion.button
            ref={ref}
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -1 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
                'bg-accent text-white font-body font-medium text-sm px-4 py-2.5 rounded-lg shadow-[0_4px_14px_rgba(52,84,209,0.3)] transition-shadow hover:shadow-[0_6px_18px_rgba(52,84,209,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
                className,
            )}
            {...props}
        >
            {children}
        </motion.button>
    ),
);
Button.displayName = 'Button';