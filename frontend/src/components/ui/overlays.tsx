'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Dialog as DialogPrimitive,
  DropdownMenu as MenuPrimitive,
  Popover as PopoverPrimitive,
} from 'radix-ui';
import { X } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { cn } from '@/lib/utils';
import { IconButton } from './controls';
import { useInertBackground } from './use-inert-background';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  description: string;
  drawer?: boolean;
}
export function DialogContent({
  title,
  description,
  drawer,
  children,
  className,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content
        {...props}
        className={cn(drawer ? 'ui-drawer' : 'ui-dialog', className)}
      >
        <div className="mb-6 pr-10">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        </div>
        {children}
        <DialogPrimitive.Close asChild>
          <IconButton label="Close" className="absolute right-3 top-3">
            <X className="size-4" />
          </IconButton>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DrawerContent(props: Omit<DialogContentProps, 'drawer'>) {
  return <DialogContent {...props} drawer />;
}
export function Popover({
  trigger,
  label,
  children,
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          aria-label={label}
          sideOffset={6}
          className="ui-floating z-50 w-72 max-w-[calc(100vw-2rem)] p-4"
        >
          {children}
          <PopoverPrimitive.Close asChild>
            <IconButton label={`Close ${label}`} className="mt-3">
              <X className="size-4" />
            </IconButton>
          </PopoverPrimitive.Close>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
export function DropdownMenu({
  trigger,
  items,
  label,
}: {
  trigger: ReactNode;
  label: string;
  items: {
    id: string;
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    destructive?: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const inertBackground = useInertBackground(open);
  return (
    <MenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          ref={inertBackground}
          aria-label={label}
          sideOffset={6}
          align="end"
          className="ui-floating z-50 min-w-48 max-w-[calc(100vw-2rem)] p-1"
        >
          {items.map((item) => (
            <MenuPrimitive.Item
              key={item.id}
              onSelect={item.onSelect}
              disabled={item.disabled}
              data-destructive={item.destructive || undefined}
              className="ui-menu-item"
            >
              {item.label}
            </MenuPrimitive.Item>
          ))}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
export { toast };
export function Toast() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: 'var(--popover)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-popover)',
        },
      }}
    />
  );
}
