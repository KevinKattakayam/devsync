'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity } from '@/types';
import { workspaceApi } from '@/lib/api';
import { formatRelativeTime, getInitials } from '@/lib/utils';
import {
  Clock,
  FileText,
  CheckSquare,
  UserPlus,
  Code2,
  Activity as ActivityIcon,
} from 'lucide-react';

interface ActivityFeedProps {
  workspaceId: string;
  initialActivities?: Activity[];
}

export function ActivityFeed({ workspaceId, initialActivities = [] }: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [filter, setFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchActivities = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const { data } = await workspaceApi.getActivities(workspaceId);
      setActivities(data);
    } catch {
      console.error('Activity refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (initialActivities.length === 0) {
      workspaceApi
        .getActivities(workspaceId)
        .then(({ data }) => setActivities(data))
        .catch(() => {});
    }
    const interval = setInterval(fetchActivities, 12000);
    return () => clearInterval(interval);
  }, [workspaceId, fetchActivities, initialActivities.length]);

  const filteredActivities = activities.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'docs') return a.type.includes('doc');
    if (filter === 'tasks') return a.type.includes('task');
    if (filter === 'snippets') return a.type.includes('snippet');
    if (filter === 'team') return a.type.includes('member') || a.type.includes('workspace');
    return true;
  });

  const getActivityIcon = (type: string) => {
    if (type.includes('doc')) return <FileText className="w-3.5 h-3.5 text-indigo-400" />;
    if (type.includes('task')) return <CheckSquare className="w-3.5 h-3.5 text-amber-400" />;
    if (type.includes('snippet')) return <Code2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (type.includes('member')) return <UserPlus className="w-3.5 h-3.5 text-purple-400" />;
    return <ActivityIcon className="w-3.5 h-3.5 text-sky-400" />;
  };

  return (
    <div className="glass-card p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg gradient-primary text-primary-foreground shadow-md">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Activity Stream</h3>
            <p className="text-[11px] text-muted-foreground">
              Recorded workspace events · refreshes every 12 seconds
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-[10px] text-foreground font-medium">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isRefreshing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`}
            />
            <span>{isRefreshing ? 'Refreshing…' : 'Auto-refresh'}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'all', label: 'All Events' },
          { id: 'docs', label: 'Docs' },
          { id: 'tasks', label: 'Tasks' },
          { id: 'snippets', label: 'Snippets' },
          { id: 'team', label: 'Team' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              filter === tab.id
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredActivities && filteredActivities.length > 0 ? (
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {filteredActivities.slice(0, 20).map((a: Activity) => (
            <div
              key={a.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-all border border-white/[0.04] group hover:border-primary/20"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-foreground bg-secondary flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                {getInitials(a.user?.name || a.user?.email || '?')}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate text-foreground">
                    <span className="font-semibold text-indigo-300">
                      {a.user?.name || 'Member'}
                    </span>{' '}
                    <span className="text-slate-300">{a.message}</span>
                  </p>
                  <div className="p-1 rounded-md bg-secondary/80 flex-shrink-0">
                    {getActivityIcon(a.type)}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatRelativeTime(a.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <ActivityIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2 animate-bounce" />
          <p className="text-xs text-muted-foreground">
            No matching activity logged for this filter
          </p>
        </div>
      )}
    </div>
  );
}
