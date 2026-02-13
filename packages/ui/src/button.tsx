import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition',
        {
          'bg-indigo-600 text-white hover:bg-indigo-500': variant === 'primary',
          'border border-zinc-700 text-zinc-300 hover:border-zinc-500': variant === 'secondary',
          'text-zinc-400 hover:text-white': variant === 'ghost',
          'bg-red-600 text-white hover:bg-red-500': variant === 'danger',
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className,
      )}
      {...props}
    />
  );
}
