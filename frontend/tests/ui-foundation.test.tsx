import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  CommandPalette,
  Dialog,
  DialogContent,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DropdownMenu,
  Input,
  Popover,
  Select,
  Switch,
  Tabs,
} from '../src/components/ui';

afterEach(cleanup);

it('blocks duplicate pending submissions and preserves native form submission', async () => {
  const user = userEvent.setup();
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const save = vi.fn();
  render(
    <form onSubmit={submit}>
      <Button pending onClick={save}>
        Save
      </Button>
      <Button type="submit">Submit</Button>
    </form>,
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-busy')).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  expect(submit).toHaveBeenCalledOnce();
});

for (const drawer of [false, true]) {
  it(`${drawer ? 'drawer' : 'dialog'} traps keyboard focus, closes with Escape and restores the trigger`, async () => {
    const user = userEvent.setup();
    const Root = drawer ? Drawer : Dialog;
    const Trigger = drawer ? DrawerTrigger : DialogTrigger;
    const Content = drawer ? DrawerContent : DialogContent;
    render(
      <>
        <Button>Outside</Button>
        <Root>
          <Trigger asChild>
            <Button>Open</Button>
          </Trigger>
          <Content title="Details" description="Edit document details.">
            <Input aria-label="Title" />
          </Content>
        </Root>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Details' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
}

it('checkboxes and switches change with Space and disabled controls stay inert', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Checkbox aria-label="Track changes" />
      <Switch aria-label="Focus mode" />
      <Checkbox disabled aria-label="Unavailable" />
    </>,
  );
  await user.tab();
  await user.keyboard(' ');
  expect(screen.getByRole('checkbox', { name: 'Track changes' }).getAttribute('aria-checked')).toBe(
    'true',
  );
  await user.tab();
  await user.keyboard(' ');
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  await user.click(screen.getByRole('checkbox', { name: 'Unavailable' }));
  expect(screen.getByRole('checkbox', { name: 'Unavailable' }).getAttribute('aria-checked')).toBe(
    'false',
  );
});

it('tabs support arrow navigation and skip unavailable panels', async () => {
  const user = userEvent.setup();
  render(
    <Tabs
      label="Resources"
      defaultValue="a"
      items={[
        { value: 'a', label: 'Documents', content: 'Document content' },
        { value: 'disabled', label: 'Unavailable', disabled: true, content: 'Hidden' },
        { value: 'b', label: 'Board', content: 'Board content' },
      ]}
    />,
  );
  await user.tab();
  await user.keyboard('{ArrowRight}');
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Board' }).getAttribute('aria-selected')).toBe('true'),
  );
  expect(screen.getByRole('tabpanel').textContent).toBe('Board content');
});

it('menu keyboard navigation skips disabled actions and restores focus', async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  const { container } = render(
    <DropdownMenu
      label="Actions"
      trigger={<Button>Menu</Button>}
      items={[
        { id: 'a', label: 'Disabled', disabled: true, onSelect: select },
        { id: 'b', label: 'Open document', onSelect: select },
      ]}
    />,
  );
  container.inert = false;
  await user.tab();
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('menu');
  expect(container.inert).toBe(true);
  await user.keyboard('{Enter}');
  expect(select).toHaveBeenCalledOnce();
  await waitFor(() => expect(container.inert).toBe(false));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu' })),
  );
});

it('popover closes with Escape and restores its trigger', async () => {
  const user = userEvent.setup();
  render(
    <Popover label="Options" trigger={<Button>Options</Button>}>
      <Input aria-label="Filter" />
    </Popover>,
  );
  const trigger = screen.getByRole('button', { name: 'Options' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Options' }).contains(document.activeElement)).toBe(
    true,
  );
  await user.keyboard('{Escape}');
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('select has a named trigger and exposes its disabled state', () => {
  render(
    <Select
      label="Destination"
      disabled
      options={[{ value: 'docs', label: 'Documents' }]}
      defaultValue="docs"
    />,
  );
  expect(
    screen.getByRole('combobox', { name: 'Destination' }).getAttribute('data-disabled'),
  ).not.toBeNull();
});

it('commands filter, announce empty results, skip disabled actions and run the active match', async () => {
  const user = userEvent.setup();
  const first = vi.fn();
  const second = vi.fn();
  const disabled = vi.fn();
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        actions={[
          { id: 'first', label: 'First document', onSelect: first },
          { id: 'disabled', label: 'Unavailable document', disabled: true, onSelect: disabled },
          { id: 'second', label: 'Second document', onSelect: second },
        ]}
      />
    );
  }
  render(<Example />);
  await user.click(screen.getByRole('button', { name: /Commands/ }));
  const input = screen.getByRole('combobox', { name: 'Search commands' });
  await user.type(input, 'missing');
  expect(screen.getByRole('status').textContent).toBe('No matching commands.');
  await user.clear(input);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(second).toHaveBeenCalledOnce();
  expect(first).not.toHaveBeenCalled();
  expect(disabled).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('select supports keyboard choice and releases the background after dismissal', async () => {
  const user = userEvent.setup();
  const original = HTMLElement.prototype.scrollIntoView;
  // jsdom has no layout/scroll implementation; Radix still performs real focus and state work.
  HTMLElement.prototype.scrollIntoView = vi.fn();
  try {
    const { container } = render(
      <Select
        label="Choose destination"
        defaultValue="docs"
        options={[
          { value: 'docs', label: 'Documents' },
          { value: 'disabled', label: 'Unavailable', disabled: true },
          { value: 'board', label: 'Board' },
        ]}
      />,
    );
    container.inert = false;
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    expect(container.inert).toBe(true);
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await waitFor(() => expect(container.inert).toBe(false));
    const trigger = screen.getByRole('combobox', { name: 'Choose destination' });
    expect(trigger.textContent).toBe('Board');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  } finally {
    HTMLElement.prototype.scrollIntoView = original;
  }
});
