'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';

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
    const bottomRef = useRef<HTMLDivElement>(null);

    const { data: messages, isLoading } = useQuery<Message[]>({
        queryKey: ['messages', conversationId],
        queryFn: () => apiClient.get(`/chat/conversations/${conversationId}/messages`).then((r) => r.data),
    });

    const sendMutation = useMutation({
        mutationFn: (message: string) =>
            apiClient.post(`/chat/conversations/${conversationId}/messages`, { message }),
        onSuccess: () => {
            setInput('');
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] }); // updatedAt changed, reorders list
        },
    });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="max-w-2xl flex flex-col h-[calc(100vh-8rem)]">
            <h1 className="font-heading text-xl text-ink mb-4">Chat</h1>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3 mb-4">
                {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

                {messages?.length === 0 && (
                    <p className="text-sm text-ink-grey">
                        Ask anything about this role — why you were or weren't a match, or what to improve.
                    </p>
                )}

                {messages?.map((msg) => (
                    <div
                        key={msg.id}
                        className={`max-w-[80%] px-4 py-2.5 rounded-xl text-sm ${msg.sender === 'user'
                                ? 'bg-accent text-white self-end'
                                : 'bg-paper-raised border border-hairline text-ink self-start'
                            }`}
                    >
                        {msg.content}
                    </div>
                ))}

                {sendMutation.isPending && (
                    <div className="bg-paper-raised border border-hairline text-ink-grey self-start px-4 py-2.5 rounded-xl text-sm">
                        Thinking...
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (input.trim()) sendMutation.mutate(input.trim());
                }}
                className="flex gap-2"
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
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