import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated';
}

export function Card({ variant = 'bordered', className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl bg-zinc-950 p-6',
        {
          'border border-zinc-800': variant === 'bordered',
          'shadow-lg shadow-black/50': variant === 'elevated',
        },
        className,
      )}
      {...props}
    />
  );
}
