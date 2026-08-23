import { useId, type ComponentProps } from 'react';

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: string;
}

export default function Checkbox({ label, className = '', id, ...rest }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex items-center gap-2.5">
      <input
        {...rest}
        type="checkbox"
        id={inputId}
        className={
          'h-4 w-4 shrink-0 cursor-pointer rounded-[0.25rem] border border-haze/80 bg-abyss/80 ' +
          'accent-neon-cyan focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'focus-visible:outline-neon-cyan ' +
          className
        }
      />
      <label
        htmlFor={inputId}
        className="cursor-pointer font-display text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-ink-mute"
      >
        {label}
      </label>
    </div>
  );
}
