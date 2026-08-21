import type { ComponentProps } from 'react';

export default function Input({ className = '', ...rest }: ComponentProps<'input'>) {
  return (
    <input
      {...rest}
      className={
        'w-full rounded-control border border-haze/80 bg-abyss/70 px-4 py-3 text-ink ' +
        'placeholder:text-ink-mute ease-snap duration-[var(--dur-cut)] ' +
        'transition-[border-color,box-shadow] ' +
        'focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/35 ' +
        className
      }
    />
  );
}
