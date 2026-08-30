'use client';
import { useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

/**
 * The way into the broadcast screen (PRD §1: a room hands out a join link, a
 * QR and a stage link).
 *
 * Host-only: a player tapping this on their phone would replace their own game
 * with a spectator view of it. The anchor carries a real href so it can be
 * copied, opened in a new tab, or dragged onto a second display — a button
 * that only calls `window.open` can do none of those.
 */
export default function StageLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/stage/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied outright (insecure origin, permission
      // policy). The URL is on screen either way, so this is a silent no-op
      // rather than an error the host can do anything about.
    }
  }

  return (
    <Panel className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <h2 className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan">
          Stage view
        </h2>
        <p className="truncate text-sm text-ink-dim">{url}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <a
          data-testid="stage-link"
          href={`/stage/${code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-control bg-neon-cyan
            px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-void
            shadow-[0_0_32px_-8px_var(--color-neon-cyan)]
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan"
        >
          Open
        </a>
      </div>
    </Panel>
  );
}
