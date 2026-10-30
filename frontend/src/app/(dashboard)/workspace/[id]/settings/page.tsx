'use client';

export default function WorkspaceSettings() {
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold mb-6">Workspace Settings</h1>
      <div className="glass-card p-6 space-y-6">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Workspace Name</label>
          <input
            type="text"
            className="w-full px-4 py-2.5 rounded-lg bg-muted/50 border border-border text-sm outline-none focus:border-primary"
            placeholder="Workspace name"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Description</label>
          <textarea
            className="w-full px-4 py-2.5 rounded-lg bg-muted/50 border border-border text-sm resize-none outline-none focus:border-primary"
            rows={3}
            placeholder="Description"
          />
        </div>
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-destructive mb-2">Danger Zone</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Deleting a workspace is permanent and cannot be undone.
          </p>
          <button className="px-4 py-2 rounded-lg border border-destructive text-destructive text-sm hover:bg-destructive/10 transition-colors">
            Delete Workspace
          </button>
        </div>
      </div>
    </div>
  );
}
