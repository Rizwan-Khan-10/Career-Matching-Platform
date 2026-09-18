'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';

interface Conversation {
    id: string;
    jobRoleId: string;
    name: string;
    updatedAt: string;
}

export default function ChatListPage() {
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const { data: conversations, isLoading } = useQuery<Conversation[]>({
        queryKey: ['conversations'],
        queryFn: () => apiClient.get('/chat/conversations').then((r) => r.data),
    });

    const renameMutation = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) =>
            apiClient.patch(`/chat/conversations/${id}`, { name }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            setEditingId(null);
        },
        onError: () => toast.error('Could not rename conversation'),
    });

    return (
        <div className="max-w-2xl">
            <h1 className="font-heading text-2xl text-ink mb-1">Chat</h1>
            <p className="text-sm text-ink-grey mb-6">
                One conversation per role you've been evaluated against — ask about your match or feedback.
            </p>

            {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

            {conversations?.length === 0 && (
                <p className="text-sm text-ink-grey">
                    No conversations yet — these appear automatically once you've been matched against a role.
                </p>
            )}

            <div className="flex flex-col gap-2">
                {conversations?.map((convo) => (
                    <div
                        key={convo.id}
                        className="bg-paper-raised border border-hairline rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                    >
                        {editingId === convo.id ? (
                            <input
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') renameMutation.mutate({ id: convo.id, name: editValue });
                                    if (e.key === 'Escape') setEditingId(null);
                                }}
                                onBlur={() => renameMutation.mutate({ id: convo.id, name: editValue })}
                                className="flex-1 border border-hairline rounded px-2 py-1 text-sm font-body text-ink focus:outline-none focus:border-accent"
                            />
                        ) : (
                            <Link href={`/applicant/chat/${convo.id}`} className="flex-1 text-sm font-medium text-ink hover:text-accent">
                                {convo.name}
                            </Link>
                        )}

                        <button
                            onClick={() => {
                                setEditingId(convo.id);
                                setEditValue(convo.name);
                            }}
                            className="text-xs text-ink-grey hover:text-accent shrink-0"
                        >
                            Rename
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}