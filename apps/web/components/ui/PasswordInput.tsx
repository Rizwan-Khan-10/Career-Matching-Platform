'use client';

import { forwardRef, useState, InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/Input';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const PasswordInput = forwardRef<HTMLInputElement, Props>(({ onKeyUp, onBlur, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const [capsOn, setCapsOn] = useState(false);

    return (
        <div>
            <div className="relative">
                <Input
                    {...props}
                    ref={ref}
                    type={visible ? 'text' : 'password'}
                    className="pr-10"
                    onKeyUp={(e) => {
                        setCapsOn(e.getModifierState('CapsLock'));
                        onKeyUp?.(e);
                    }}
                    onBlur={(e) => {
                        setCapsOn(false);
                        onBlur?.(e);
                    }}
                />
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-grey hover:text-ink transition-colors"
                >
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
            {capsOn && <p className="text-xs text-ink-grey mt-1">Caps Lock is on</p>}
        </div>
    );
});
PasswordInput.displayName = 'PasswordInput';