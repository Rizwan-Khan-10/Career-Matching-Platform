import { FadeIn } from '@/components/motion/FadeIn';

// A template re-mounts on every navigation, so each page fades in the same way. It sits below the layout,
// so the sidebar and top bar stay put.
export default function Template({ children }: { children: React.ReactNode }) {
  return <FadeIn>{children}</FadeIn>;
}
