import { clsx } from 'clsx';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: React.ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
        'bg-green-600/20 text-green-400': variant === 'success',
        'bg-yellow-600/20 text-yellow-400': variant === 'warning',
        'bg-red-600/20 text-red-400': variant === 'error',
        'bg-blue-600/20 text-blue-400': variant === 'info',
        'bg-zinc-700/50 text-zinc-400': variant === 'neutral',
      })}
    >
      {children}
    </span>
  );
}
