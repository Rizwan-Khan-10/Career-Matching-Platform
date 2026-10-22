'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { motion } from 'motion/react';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';
import { Skeleton } from '@/components/ui/Skeleton';

interface Message {
    id: string;
    sender: 'user' | 'agent';
    content: string;
    createdAt: string;
}

export default function ChatThreadPage() {
    const params = useParams();
    const conversationId = params.conversationId as string;
    const queryClient = useQueryClient();
    const [input, setInput] = useState('');
    const [pending, setPending] = useState<string | null>(null); // the question being answered: shown immediately
    const bottomRef = useRef<HTMLDivElement>(null);

    const { data: messages, isLoading } = useQuery<Message[]>({
        queryKey: ['messages', conversationId],
        queryFn: () => apiClient.get(`/chat/conversations/${conversationId}/messages`).then((r) => r.data),
    });

    const sendMutation = useMutation({
        mutationFn: (message: string) => apiClient.post(`/chat/conversations/${conversationId}/messages`, { message }),
        onSuccess: async () => {
            // wait for the fresh list BEFORE removing the optimistic bubble -> no flicker / double bubble
            await queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
            setPending(null);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
        onError: (err, message) => {
            setPending(null);
            setInput((cur) => cur || message); // nothing was saved server-side: give the text back so the user can retry
            toast.error(getErrorMessage(err, 'Message failed to send, try again'));
        },
    });

    const submit = () => {
        const text = input.trim();
        if (!text || sendMutation.isPending) return;
        setPending(text);
        setInput('');
        sendMutation.mutate(text);
    };

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pending]);

    const bubble = 'max-w-[80%] px-4 py-2.5 rounded-xl text-sm whitespace-pre-wrap break-words';

    return (
        <div className="max-w-2xl flex flex-col h-[calc(100vh-8rem)]">
            <h1 className="font-heading text-xl text-ink mb-4">Chat</h1>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3 mb-4">
                {isLoading && (
                    <div role="status" aria-label="Loading messages" className="flex flex-col gap-3">
                        <Skeleton className="h-10 w-2/3 self-start rounded-xl" />
                        <Skeleton className="h-10 w-1/2 self-end rounded-xl" />
                        <Skeleton className="h-14 w-3/4 self-start rounded-xl" />
                    </div>
                )}

                {messages?.length === 0 && !pending && (
                    <p className="text-sm text-ink-grey">
                        Ask anything about this role — why you were or weren&apos;t a match, or what to improve.
                    </p>
                )}

                {messages?.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`${bubble} ${msg.sender === 'user' ? 'bg-accent text-white self-end' : 'bg-paper-raised border border-hairline text-ink self-start'}`}
                    >
                        {msg.content}
                    </motion.div>
                ))}

                {pending && (
                    <>
                        <div className={`${bubble} bg-accent text-white self-end`}>{pending}</div>
                        <div className={`${bubble} bg-paper-raised border border-hairline text-ink-grey self-start`}>Thinking...</div>
                    </>
                )}

                <div ref={bottomRef} />
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                className="flex gap-2"
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    maxLength={2000}
                    aria-label="Message"
                    placeholder="Type a message..."
                    className="flex-1 border border-hairline bg-paper-raised rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-accent"
                />
                <Button type="submit" disabled={sendMutation.isPending || !input.trim()}>
                    Send
                </Button>
            </form>
        </div>
    );
}