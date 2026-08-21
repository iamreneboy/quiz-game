import type { ComponentProps } from 'react';

/** Glassmorphic surface: translucent indigo, backdrop blur, hairline border. */
export default function Panel({ className = '', children, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      {...rest}
      className={
        'rounded-panel border border-white/10 bg-night/55 backdrop-blur-xl ' +
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_60px_-28px_#000] ' +
        className
      }
    >
      {children}
    </div>
  );
}
