import { Providers } from "@/components/Providers";
import "./globals.css";

import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";

import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

export const metadata = {
  title: 'CareerMatch',
  description: 'Multi-agent AI career and job matching platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}