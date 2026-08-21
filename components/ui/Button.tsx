import type { ComponentProps } from 'react';

type Variant = 'primary' | 'ghost' | 'quiet';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-display font-semibold ' +
  'uppercase tracking-[0.12em] ease-snap duration-[var(--dur-cut)] ' +
  'transition-[background-color,border-color,color,box-shadow,transform] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ' +
  'enabled:active:translate-y-px';

const variants: Record<Variant, string> = {
  primary:
    'bg-neon-cyan text-void shadow-[0_0_32px_-8px_var(--color-neon-cyan)] ' +
    'enabled:hover:bg-ink enabled:hover:shadow-[0_0_40px_-6px_var(--color-neon-cyan)]',
  ghost:
    'border border-haze bg-night/60 text-ink ' +
    'enabled:hover:border-neon-cyan enabled:hover:text-neon-cyan',
  quiet: 'text-ink-dim enabled:hover:text-ink',
};

const sizes: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-4 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...rest}
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
}
