'use client';
import { SettingsError } from '@/components/settings/states';
export default function SettingsBoundary({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <h1 className="mb-6 text-[28px] font-semibold leading-9">Workspace settings</h1>
      <SettingsError retry={retry} />
    </div>
  );
}
