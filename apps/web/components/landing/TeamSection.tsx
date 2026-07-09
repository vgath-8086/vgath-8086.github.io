'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface Member {
  name: string;
  username: string;
  image?: string;
  url?: string;
}

const TEAM: Member[] = [
  {
    name: 'Sidali Assoul',
    username: 'stormsidali2001',
    image: '/team/stormsidali2001.jpg',
    url: 'https://sidaliassoul.com/',
  },
  { name: 'idrisT11', username: 'idrisT11' },
  { name: 'Gaouaoui Kamel', username: 'Scorpion197' },
  { name: 'anis77-collab', username: 'anis77-collab' },
  { name: 'bensalem14', username: 'bensalem14' },
  { name: 'yassineoo', username: 'yassineoo' },
];

function Avatar({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xl font-semibold text-zinc-300">
        {name[0].toUpperCase()}
      </span>
    );
  }
  return (
    // ponytail: plain <img> — next/image is unoptimized under output:'export' anyway
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      className="h-16 w-16 rounded-full border border-zinc-700 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function TeamSection() {
  return (
    <section className="w-full max-w-5xl px-6 py-16">
      <div className="text-center mb-10 max-w-2xl mx-auto">
        <span className="inline-block text-xs font-semibold uppercase tracking-wide text-brand-400 bg-brand-900/30 rounded-full px-3 py-1 mb-3">
          Our Story
        </span>
        <h2 className="text-2xl font-bold text-zinc-100 mb-3">Built by students, for students</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          8086 Online IDE started as a 2nd-year final project at ESI-SBA, built by a team of 6
          under the name Vgath 8086.
        </p>
        <a
          href="https://github.com/vgath-8086/8086-Online-IDE-SBA"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-sm text-brand-400 hover:text-brand-300"
        >
          View the project on GitHub <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
        {TEAM.map(m => (
          <a
            key={m.username}
            href={m.url ?? `https://github.com/${m.username}`}
            target="_blank"
            rel={m.url ? 'noopener' : 'noopener noreferrer'}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-4 text-center hover:border-brand-700 transition-colors"
          >
            <Avatar name={m.name} src={m.image ?? `https://github.com/${m.username}.png?size=128`} />
            {m.name === m.username ? (
              <span className="text-sm font-medium text-zinc-200">@{m.name}</span>
            ) : (
              <>
                <span className="text-sm font-medium text-zinc-200">{m.name}</span>
                <span className="text-xs text-zinc-400">@{m.username}</span>
              </>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
