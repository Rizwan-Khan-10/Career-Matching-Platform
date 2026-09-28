import { cn } from '@/lib/cn';

const COLORS = [
    'bg-accent-soft text-accent',
    'bg-success-soft text-success',
    'bg-danger-soft text-danger',
];

function colorFor(name: string) {
    const sum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return COLORS[sum % COLORS.length];
}

function initialsFor(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
    src,
    name,
    size = 40,
}: {
    src?: string | null;
    name: string;
    size?: number;
}) {
    const style = { width: size, height: size };

    if (src) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt={name}
                style={style}
                className="rounded-full object-cover shrink-0 border border-hairline"
            />
        );
    }

    return (
        <div
            style={{ ...style, fontSize: size * 0.4 }}
            className={cn(
                'rounded-full flex items-center justify-center font-medium font-heading shrink-0',
                colorFor(name || '?'),
            )}
        >
            {initialsFor(name || '?')}
        </div>
    );
}