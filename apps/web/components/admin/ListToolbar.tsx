import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';

export function ListToolbar({
    search,
    onSearch,
    placeholder,
    tabs,
    active,
    onTab,
}: {
    search: string;
    onSearch: (value: string) => void;
    placeholder: string;
    tabs: { id: string; label: string; count: number }[];
    active: string;
    onTab: (id: string) => void;
}) {
    return (
        <div className="space-y-3 mb-4">
            <Input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={placeholder}
                aria-label={placeholder}
            />
            <div className="flex flex-wrap gap-1" role="tablist">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active === tab.id}
                        onClick={() => onTab(tab.id)}
                        className={cn(
                            'text-sm font-medium px-3 py-1.5 rounded-lg transition-colors',
                            active === tab.id ? 'bg-accent-soft text-accent' : 'text-ink-grey hover:text-ink',
                        )}
                    >
                        {tab.label} <span className="font-mono text-xs">{tab.count}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}