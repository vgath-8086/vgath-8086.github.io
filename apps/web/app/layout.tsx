import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import { SITE_URL } from '@/lib/site';
import './globals.css';

const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

const description =
  'Write, compile and step through 8086 assembly programs in your browser. ' +
  'Free online assembler and emulator with a live debugger: registers, flags, RAM, stack and console.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '8086 Online IDE — Assembly Compiler, Emulator & Debugger',
    template: '%s | 8086 Online IDE',
  },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: '8086 Online IDE',
    title: '8086 Online IDE — Assembly Compiler, Emulator & Debugger',
    description,
    images: ['/screenshot-ide.png'],
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} font-mono bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
