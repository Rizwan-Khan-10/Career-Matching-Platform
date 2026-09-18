'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';

export default function CompanyAskPage() {
    const [input, setInput] = useState('');
    const [reply, setReply] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: (message: string) => apiClient.post('/chat/quick', { message }),
        onSuccess: (res) => setReply(res.data.reply),
        onError: () => toast.error('Could not get a response, try again'),
    });

    return (
        <div className="max-w-2xl">
            <h1 className="font-heading text-2xl text-ink mb-1">Ask AI</h1>
            <p className="text-sm text-ink-grey mb-6">Ask about your posted roles and applicant matches.</p>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (input.trim()) mutation.mutate(input.trim());
                }}
                className="flex gap-2 mb-4"
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g. How many applicants matched my SDE role?"
                    className="flex-1 border border-hairline bg-paper-raised rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-accent"
                />
                <Button type="submit" disabled={mutation.isPending || !input.trim()}>
                    {mutation.isPending ? 'Asking...' : 'Ask'}
                </Button>
            </form>

            {reply && (
                <div className="bg-paper-raised border border-hairline rounded-xl p-4 text-sm text-ink">
                    {reply}
                </div>
            )}
        </div>
    );
}