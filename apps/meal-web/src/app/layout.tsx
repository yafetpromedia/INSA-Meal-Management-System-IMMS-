import type { Metadata, Viewport } from 'next';
import { Manrope, Noto_Sans_Ethiopic, Source_Sans_3 } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import './globals.css';

const display = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const ethiopic = Noto_Sans_Ethiopic({
  subsets: ['ethiopic'],
  variable: '--font-ethiopic',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'IMMS — Camp Management',
  description: 'Multi-campus meal distribution and verification for training programs',
  icons: {
    icon: '/brand/insa-mark.png',
    apple: '/brand/insa-mark.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${display.variable} ${sans.variable} ${ethiopic.variable}`}
    >
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
