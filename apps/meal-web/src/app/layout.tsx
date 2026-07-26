import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IMMS — INSA Meal Management System',
  description: 'Multi-campus meal distribution and verification for training programs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
