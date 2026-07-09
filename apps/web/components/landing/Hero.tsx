import Image from 'next/image';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  exampleCount: number;
}

export function Hero({ exampleCount }: Props) {
  return (
    <section className="w-full max-w-3xl px-6 pt-20 pb-10 flex flex-col items-center text-center gap-6">
      <Image src="/logo.png" alt="" width={635} height={403} className="h-20 w-auto" priority />
      <h1 className="text-4xl font-bold text-zinc-100">8086 Online IDE</h1>
      <p className="text-zinc-400 max-w-md">
        Write, compile and step through 8086 assembly programs in your browser.
        Full register, RAM, stack and console visibility.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-brand-900/40 text-brand-300 border border-brand-800">
          Live CPU Debugger
        </span>
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-brand-900/40 text-brand-300 border border-brand-800">
          1MB Memory Map
        </span>
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-brand-900/40 text-brand-300 border border-brand-800">
          {exampleCount} Examples
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/ide">
          <Button size="lg">Open IDE</Button>
        </Link>
        <a
          href="https://github.com/vgath-8086/8086-Online-IDE-SBA"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="lg" variant="outline">
            <Star className="h-4 w-4" /> Star on GitHub
          </Button>
        </a>
      </div>
    </section>
  );
}
