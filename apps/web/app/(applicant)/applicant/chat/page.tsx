'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { TimeAgo } from '@/components/ui/TimeAgo';

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

    const { data: conversations, isLoading, isError, refetch } = useQuery<Conversation[]>({
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

    const commitRename = (id: string, original: string) => {
        if (renameMutation.isPending) return;
        const name = editValue.trim();
        if (!name || name === original) { setEditingId(null); return; }
        renameMutation.mutate({ id, name });
    };

    return (
        <div className="max-w-2xl">
            <h1 className="font-heading text-2xl text-ink mb-1">Chat</h1>
            <p className="text-sm text-ink-grey mb-6">
                One conversation per role you&apos;ve been evaluated against — ask about your match or feedback.
            </p>

            {isLoading && <ListSkeleton rows={3} />}

            {isError && <ErrorBox message="Couldn't load your conversations." onRetry={() => refetch()} />}

            {conversations?.length === 0 && (
                <EmptyState
                    icon={MessagesSquare}
                    title="No conversations yet"
                    text="One appears for each role once you have been matched against it."
                    actionLabel="See my matches"
                    actionHref="/applicant/matches"
                />
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
                                    if (e.key === 'Enter') commitRename(convo.id, convo.name);
                                    if (e.key === 'Escape') setEditingId(null);
                                }}
                                onBlur={() => commitRename(convo.id, convo.name)}
                                className="flex-1 border border-hairline rounded px-2 py-1 text-sm font-body text-ink focus:outline-none focus:border-accent"
                            />
                        ) : (
                            <Link href={`/applicant/chat/${convo.id}`} className="flex-1 min-w-0 text-sm font-medium text-ink hover:text-accent">
                                <span className="block truncate">{convo.name}</span>
                                <TimeAgo iso={convo.updatedAt} className="block text-xs font-normal text-ink-grey" />
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