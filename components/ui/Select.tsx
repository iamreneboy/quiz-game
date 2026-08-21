import { useId, type ComponentProps } from 'react';

interface SelectProps extends Omit<ComponentProps<'select'>, 'children'> {
  label: string;
  options: readonly { value: string; label: string }[];
}

export default function Select({ label, options, className = '', id, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-ink-mute"
      >
        {label}
      </label>
      <div className="relative">
        <select
          {...rest}
          id={selectId}
          className={
            'w-full appearance-none rounded-control border border-haze/80 bg-abyss/80 ' +
            'py-2 pl-3 pr-9 text-sm text-ink ' +
            'focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/35 ' +
            className
          }
        >
          {options.map(option => (
            <option key={option.value} value={option.value} className="bg-abyss text-ink">
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 fill-none stroke-ink-dim stroke-2"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
