'use client';

import { useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

export function SkillsInput({
    value,
    onChange,
}: {
    value: string[];
    onChange: (skills: string[]) => void;
}) {
    const [draft, setDraft] = useState('');

    const addSkill = () => {
        const skill = draft.trim();
        if (!skill) return;
        if (!value.some((s) => s.toLowerCase() === skill.toLowerCase())) {
            onChange([...value, skill]);
        }
        setDraft('');
    };

    const removeSkill = (skill: string) => {
        onChange(value.filter((s) => s !== skill));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addSkill();
        } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            removeSkill(value[value.length - 1]);
        }
    };

    return (
        <div className="border border-hairline bg-paper-raised rounded px-3 py-2.5 focus-within:border-ink transition-colors">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
                <AnimatePresence initial={false}>
                    {value.map((skill) => (
                        <motion.span
                            key={skill}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.15 }}
                            className="inline-flex items-center gap-1 bg-accent-soft text-accent text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full"
                        >
                            {skill}
                            <button
                                type="button"
                                onClick={() => removeSkill(skill)}
                                className="hover:bg-accent/15 rounded-full p-0.5 transition-colors"
                                aria-label={`Remove ${skill}`}
                            >
                                <X className="size-3" />
                            </button>
                        </motion.span>
                    ))}
                </AnimatePresence>
            </div>
            <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addSkill}
                placeholder={value.length === 0 ? 'Type a skill and press Enter…' : 'Add another…'}
                className="w-full text-sm font-body text-ink placeholder:text-ink-grey outline-none bg-transparent"
            />
        </div>
    );
}