'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Avatar as AvatarPrimitive,
  Checkbox as CheckboxPrimitive,
  Select as SelectPrimitive,
  Switch as SwitchPrimitive,
  Tabs as TabsPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useInertBackground } from './use-inert-background';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'compact' | 'default';
  pending?: boolean;
}
export function Button({
  className,
  variant = 'primary',
  size = 'default',
  pending,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-variant={variant}
      data-size={size}
      className={cn('ui-button', className)}
    >
      {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: Omit<ButtonProps, 'children' | 'aria-label'> & { label: string; children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      {...props}
      aria-label={label}
      className={cn('ui-icon-button', props.className)}
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cn('ui-input', className)} />;
}
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn('ui-input min-h-24 resize-y', className)} />;
}
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export function Select({
  label,
  placeholder = 'Choose an option',
  options,
  disabled,
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  triggerId,
  ...props
}: ComponentProps<typeof SelectPrimitive.Root> & {
  label: string;
  triggerId?: string;
  placeholder?: string;
  options: SelectOption[];
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen || false);
  const open = controlledOpen ?? localOpen;
  const inertBackground = useInertBackground(open);
  return (
    <SelectPrimitive.Root
      {...props}
      disabled={disabled}
      open={open}
      onOpenChange={(value) => {
        setLocalOpen(value);
        onOpenChange?.(value);
      }}
    >
      <SelectPrimitive.Trigger
        id={triggerId}
        aria-label={label}
        className="ui-input flex items-center justify-between gap-2"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={inertBackground}
          position="popper"
          sideOffset={6}
          className="ui-floating z-50 min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)] overflow-y-auto p-1"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="ui-menu-item"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check aria-hidden="true" className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root {...props} className={cn('ui-checkbox', className)}>
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root {...props} className={cn('ui-switch', className)}>
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="ui-floating z-[60] max-w-64 px-3 py-2 text-xs"
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
export function Tabs({
  label,
  items,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root> & {
  label: string;
  items: { value: string; label: string; content: ReactNode; disabled?: boolean }[];
}) {
  return (
    <TabsPrimitive.Root {...props}>
      <TabsPrimitive.List
        aria-label={label}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="ui-tab"
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content key={item.value} value={item.value} className="py-4">
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: 'neutral' | 'success' | 'warning' | 'destructive' }) {
  return <span {...props} data-tone={tone} className={cn('ui-badge', className)} />;
}
export function Avatar({ name, src }: { name: string; src?: string }) {
  return (
    <AvatarPrimitive.Root role="img" aria-label={name} className="ui-avatar">
      {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
      <AvatarPrimitive.Fallback aria-hidden="true">{getInitials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
export function AvatarStack({
  people,
  max = 3,
}: {
  people: { id: string; name: string; src?: string }[];
  max?: number;
}) {
  const limit = Math.max(1, max);
  return (
    <ul aria-label="Collaborators" className="flex items-center -space-x-2">
      {people.slice(0, limit).map((person) => (
        <li key={person.id} className="rounded-full ring-2 ring-background">
          <Avatar {...person} />
        </li>
      ))}
      {people.length > limit && (
        <li>
          <span
            className="ui-avatar"
            role="img"
            aria-label={`${people.length - limit} more collaborators`}
          >
            +{people.length - limit}
          </span>
        </li>
      )}
    </ul>
  );
}
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-secondary', className)}
    />
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span aria-hidden="true" className="text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      {...props}
      className={cn(
        'rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground',
        className,
      )}
    />
  );
}
