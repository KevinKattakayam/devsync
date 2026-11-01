'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTrigger } from './overlays';
import { Button, Input, Kbd } from './controls';

export interface CommandAction {
  id: string;
  label: string;
  keywords?: string;
  onSelect: () => void;
  disabled?: boolean;
}
export function CommandPalette({
  actions,
  open,
  onOpenChange,
  trigger,
}: {
  actions: CommandAction[];
  trigger?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="secondary">
            Commands <Kbd>⌘ / Ctrl K</Kbd>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title="Commands"
        description="Search actions. Use arrow keys to navigate, Enter to run, Escape to close."
      >
        {open && <CommandList actions={actions} onSelect={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
function CommandList({ actions, onSelect }: { actions: CommandAction[]; onSelect: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = actions.filter((action) =>
    `${action.label} ${action.keywords || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const enabled = filtered.filter((action) => !action.disabled);
  const active = enabled[Math.min(selected, Math.max(0, enabled.length - 1))];
  useEffect(() => {
    const option = listRef.current?.querySelector('[aria-selected="true"]');
    if (option instanceof HTMLElement) option.scrollIntoView?.({ block: 'nearest' });
  }, [selected, query]);
  const run = (action: CommandAction) => {
    if (!action.disabled) {
      onSelect();
      action.onSelect();
    }
  };
  return (
    <div>
      <Input
        role="combobox"
        aria-label="Search commands"
        aria-expanded="true"
        aria-autocomplete="list"
        aria-controls={`${id}-list`}
        aria-activedescendant={active ? `${id}-${active.id}` : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected(
              (index) =>
                (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) %
                Math.max(1, enabled.length),
            );
          }
          if (event.key === 'Enter' && active) {
            event.preventDefault();
            run(active);
          }
        }}
      />
      <div
        ref={listRef}
        role="listbox"
        aria-label="Commands"
        id={`${id}-list`}
        className="mt-3 max-h-72 overflow-y-auto"
      >
        {filtered.length === 0 && (
          <div
            role="option"
            aria-selected="false"
            aria-disabled="true"
            className="ui-menu-item text-muted-foreground"
          >
            No matching commands
          </div>
        )}
        {filtered.map((action) => (
          <div
            key={action.id}
            id={`${id}-${action.id}`}
            role="option"
            aria-selected={active?.id === action.id}
            aria-disabled={action.disabled || undefined}
            className="ui-command-option"
            onPointerMove={() => {
              const index = enabled.findIndex((item) => item.id === action.id);
              if (index >= 0) setSelected(index);
            }}
            onClick={() => run(action)}
          >
            {action.label}
          </div>
        ))}
      </div>
      <p role="status" className="mt-3 text-xs text-muted-foreground">
        {filtered.length === 0 ? 'No matching commands.' : `${filtered.length} commands`}
      </p>
    </div>
  );
}
