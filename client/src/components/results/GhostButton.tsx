/**
 * Shared action primitives for the results area.
 *
 * `GhostButton` is the quiet secondary action, `PrimaryButton` its filled
 * sibling, and `IconButton` the compact square button used for
 * speak / copy / star / share / replay actions. All three follow the house
 * style: rounded-xl, indigo accents, full light + dark support and logical
 * (RTL-safe) spacing utilities only.
 */
import type { FC, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface GhostButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  icon?: ReactNode;
}

export interface IconButtonProps {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}

const BUTTON_BASE =
  'inline-flex max-w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]';

const GHOST_TONE =
  'border border-slate-200 bg-white/70 text-slate-700 hover:border-brand-500/40 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-brand-400/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-200';

const PRIMARY_TONE =
  'border border-brand-600/40 bg-brand-600 text-white shadow-sm shadow-brand-500/25 hover:bg-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400';

const ICON_BUTTON_BASE =
  'grid size-9 shrink-0 place-items-center rounded-xl border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40';

const ICON_BUTTON_IDLE =
  'border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800';

const ICON_BUTTON_ACTIVE = 'border-brand-500/50 bg-brand-500/15 text-brand-700 dark:text-brand-200';

/** Decorative icon slot: keeps the glyph from stealing the button's label. */
const IconSlot: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
    {children}
  </span>
);

export const GhostButton: FC<GhostButtonProps> = ({
  children,
  onClick,
  disabled,
  className,
  title,
  icon,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled === true}
    {...(title ? { title } : {})}
    className={cn(BUTTON_BASE, GHOST_TONE, className)}
  >
    {icon ? <IconSlot>{icon}</IconSlot> : null}
    <span className="truncate">{children}</span>
  </button>
);

export const PrimaryButton: FC<GhostButtonProps> = ({
  children,
  onClick,
  disabled,
  className,
  title,
  icon,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled === true}
    {...(title ? { title } : {})}
    className={cn(BUTTON_BASE, PRIMARY_TONE, className)}
  >
    {icon ? <IconSlot>{icon}</IconSlot> : null}
    <span className="truncate">{children}</span>
  </button>
);

export const IconButton: FC<IconButtonProps> = ({
  children,
  label,
  onClick,
  active,
  disabled,
  className,
  title,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={title ?? label}
    disabled={disabled === true}
    className={cn(ICON_BUTTON_BASE, active === true ? ICON_BUTTON_ACTIVE : ICON_BUTTON_IDLE, className)}
  >
    {children}
  </button>
);

export default GhostButton;
