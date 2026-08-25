"use client";

import { useSocket } from "@/providers/socket-provider";
import { getInitials, generateColor } from "@/lib/utils";
import { Wifi, Sparkles } from "lucide-react";

export function PresenceBar() {
  const { isConnected, onlineUsers } = useSocket();

  return (
    <div className="flex items-center gap-3 glass px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
        <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
          <Wifi className="w-3 h-3 text-indigo-400" /> {isConnected ? "Live Presence" : "Connecting"}
        </span>
      </div>

      {onlineUsers && onlineUsers.length > 0 && (
        <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
          <div className="flex -space-x-2 overflow-hidden">
            {onlineUsers.map((u, i) => (
              <div
                key={u.userId || i}
                className="inline-block h-6 w-6 rounded-full ring-2 ring-background flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
                style={{ backgroundColor: generateColor(u.userName || u.userId || "User") }}
                title={`${u.userName || "Teammate"} is online`}
              >
                {getInitials(u.userName || "?")}
              </div>
            ))}
          </div>
          <span className="text-[10px] text-emerald-400 font-medium ml-1">
            {onlineUsers.length} online
          </span>
        </div>
      )}
    </div>
  );
}
