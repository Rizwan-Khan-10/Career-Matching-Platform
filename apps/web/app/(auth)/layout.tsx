import { AuthVisual } from '@/components/auth/AuthVisual';
import { Logo } from '@/components/ui/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[44%] bg-ink flex-col justify-between px-12 py-12 relative overflow-hidden">
        <Logo light />

        <div>
          <div className="max-w-sm mb-8">
            <h1 className="font-heading text-[2.25rem] leading-[1.15] text-white mb-4">
              Every candidate finds their match.
            </h1>
            <p className="text-white/60 text-sm leading-relaxed">
              Our matching agents read every resume and every role, then connect the two sides that actually fit.
            </p>
          </div>
          <AuthVisual />
        </div>

        <p className="text-white/35 text-xs">A multi-agent matching platform</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-12 bg-paper">
        {/* the dark panel is hidden on small screens, so the logo moves here */}
        <Logo className="lg:hidden" />
        {children}
      </div>
    </div>
  );
}