import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IDE',
  description:
    'Edit, compile and debug 8086 assembly in the browser — step execution, breakpoints, registers, flags, RAM, stack and console.',
  alternates: { canonical: '/ide' },
};

export default function IdeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
