'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { FileText, Plus, Settings } from 'lucide-react';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Checkbox,
  CommandPalette,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DropdownMenu,
  EmptyState,
  IconButton,
  Input,
  Kbd,
  Popover,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  toast,
} from '@/components/ui';
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border py-6 md:grid-cols-[12rem_1fr]">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
const options = [
  { value: 'docs', label: 'Documents' },
  { value: 'board', label: 'Sprint board' },
  { value: 'unavailable', label: 'Unavailable', disabled: true },
];
export function DesignSystem() {
  const { theme, setTheme } = useTheme();
  const [commandOpen, setCommandOpen] = useState(false);
  const [example, setExample] = useState('No demonstration action selected.');
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  return (
    <>
      <a href="#design-main" className="ui-skip-link">
        Skip to components
      </a>
      <main
        id="design-main"
        tabIndex={-1}
        className="mx-auto max-w-5xl px-4 py-8 text-foreground md:px-8"
      >
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">DevSync / UI foundation</p>
            <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Development workbench. All names, actions and states below are demonstrations.
            </p>
          </div>
          <div className="w-40">
            <Select
              label="Color theme"
              placeholder="Theme"
              value={theme || 'dark'}
              onValueChange={setTheme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </div>
        </header>
        <Section title="Actions">
          <div className="flex flex-wrap items-center gap-3">
            {(['primary', 'secondary', 'ghost', 'destructive'] as const).map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
            <Button size="compact">Compact</Button>
            <Button disabled>Disabled</Button>
            <Button pending>Saving</Button>
            <Tooltip label="Workspace settings">
              <IconButton label="Workspace settings">
                <Settings className="size-4" />
              </IconButton>
            </Tooltip>
            <IconButton label="Add document" disabled>
              <Plus className="size-4" />
            </IconButton>
          </div>
          <p className="text-xs text-muted-foreground">
            Tab through controls to inspect focus. Disabled actions cannot be activated.
          </p>
        </Section>
        <Section title="Fields">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>Document name</span>
              <Input placeholder="Untitled document" />
            </label>
            <label className="space-y-2 text-sm">
              <span>Read only</span>
              <Input readOnly value="Architecture decisions" />
            </label>
            <label className="space-y-2 text-sm">
              <span>Invalid name</span>
              <Input aria-invalid="true" aria-describedby="name-error" />
              <span id="name-error" className="text-xs text-destructive">
                Enter a document name.
              </span>
            </label>
            <label className="space-y-2 text-sm">
              <span>Disabled</span>
              <Input disabled placeholder="Unavailable" />
            </label>
            <label className="space-y-2 text-sm">
              <span>Notes</span>
              <Textarea placeholder="Add context for your team…" />
            </label>
            <div className="space-y-2">
              <span className="text-sm">Destination</span>
              <Select label="Destination" options={options} defaultValue="docs" />
              <Select label="Disabled destination" disabled options={options} />
            </div>
            <label className="space-y-2 text-sm">
              <span>Invalid notes</span>
              <Textarea aria-invalid="true" aria-describedby="notes-error" />
              <span id="notes-error" className="text-xs text-destructive">
                Add context before sharing.
              </span>
            </label>
            <label className="space-y-2 text-sm">
              <span>Disabled notes</span>
              <Textarea disabled />
            </label>
          </div>
        </Section>
        <Section title="Selection">
          <div className="flex flex-wrap gap-6">
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox /> Unchecked
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox defaultChecked /> Checked
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox defaultChecked="indeterminate" /> Indeterminate
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox disabled /> Disabled checkbox
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Switch /> Off
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Switch defaultChecked /> On
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Switch disabled /> Disabled switch
            </label>
          </div>
        </Section>
        <Section title="Overlays">
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Open dialog</Button>
              </DialogTrigger>
              <DialogContent
                title="Document details"
                description="Example modal with focus containment and restoration."
              >
                <label className="space-y-2 text-sm">
                  Name
                  <Input defaultValue="Architecture decisions" />
                </label>
                <DialogClose asChild>
                  <Button className="mt-4">Done</Button>
                </DialogClose>
              </DialogContent>
            </Dialog>
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="secondary">Open drawer</Button>
              </DrawerTrigger>
              <DrawerContent
                title="Workspace navigation"
                description="Example mobile drawer. Escape closes and restores focus."
              >
                <p className="text-sm">Document links will be integrated with the app shell.</p>
              </DrawerContent>
            </Drawer>
            <Popover
              label="Display options"
              trigger={<Button variant="secondary">Open popover</Button>}
            >
              <label className="flex items-center gap-2 text-sm">
                <Switch /> Show descriptions
              </label>
            </Popover>
            <DropdownMenu
              label="Document actions"
              trigger={<Button variant="secondary">Open menu</Button>}
              items={[
                {
                  id: 'open',
                  label: 'Open example',
                  onSelect: () => setExample('Opened example.'),
                },
                { id: 'disabled', label: 'Unavailable action', disabled: true, onSelect: () => {} },
                {
                  id: 'remove',
                  label: 'Remove example',
                  destructive: true,
                  onSelect: () => setExample('Removed example.'),
                },
              ]}
            />
            <Tooltip label="Create a document">
              <Button variant="ghost">Focus for tooltip</Button>
            </Tooltip>
          </div>
        </Section>
        <Section title="Tabs">
          <Tabs
            label="Example resource type"
            defaultValue="docs"
            items={[
              {
                value: 'docs',
                label: 'Documents',
                content: (
                  <p className="text-sm text-muted-foreground">
                    Document panel. Use left/right arrows to switch tabs.
                  </p>
                ),
              },
              {
                value: 'board',
                label: 'Board',
                content: <p className="text-sm text-muted-foreground">Board panel.</p>,
              },
              { value: 'disabled', label: 'Unavailable', disabled: true, content: null },
            ]}
          />
        </Section>
        <Section title="Status & identity">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Draft</Badge>
            <Badge tone="success">Saved</Badge>
            <Badge tone="warning">Pending</Badge>
            <Badge tone="destructive">Failed</Badge>
            <Avatar name="Example developer" />
            <Avatar name="Missing image example" src="/missing-example-avatar.png" />
            <AvatarStack
              people={[
                { id: '1', name: 'Example owner' },
                { id: '2', name: 'Example editor' },
                { id: '3', name: 'Example viewer' },
                { id: '4', name: 'Additional example' },
              ]}
            />
            <Kbd>?</Kbd>
            <Kbd>Esc</Kbd>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() =>
                toast.success('Example saved', { description: 'Demonstration notification.' })
              }
            >
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.error('Example failed', { description: 'Demonstration error.' })}
            >
              Error toast
            </Button>
            <Button variant="secondary" onClick={() => toast('Example notification')}>
              Neutral toast
            </Button>
          </div>
        </Section>
        <Section title="Loading & empty">
          <div role="status" aria-label="Loading example documents" className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
          <EmptyState
            icon={<FileText className="size-6" />}
            title="No documents yet"
            description="Create a document to give your team a place to think together."
            action={
              <Button onClick={() => setExample('Create example selected.')}>
                <Plus aria-hidden="true" className="size-4" />
                Create example
              </Button>
            }
          />
        </Section>
        <Section title="Commands">
          <CommandPalette
            open={commandOpen}
            onOpenChange={setCommandOpen}
            actions={[
              {
                id: 'docs',
                label: 'Navigate to example documents',
                onSelect: () => setExample('Navigate example selected.'),
              },
              {
                id: 'create',
                label: 'Create example document',
                onSelect: () => setExample('Create example selected.'),
              },
              ...(['dark', 'light', 'system'] as const).map((theme) => ({
                id: theme,
                label: `Switch theme to ${theme}`,
                onSelect: () => setTheme(theme),
              })),
              { id: 'disabled', label: 'Unavailable command', disabled: true, onSelect: () => {} },
            ]}
          />
          <p role="status" className="text-sm text-muted-foreground">
            {example}
          </p>
        </Section>
      </main>
    </>
  );
}
