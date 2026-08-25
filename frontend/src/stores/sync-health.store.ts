'use client';

import { create } from 'zustand';

export type SyncHealth = 'synced' | 'offline' | 'reconnecting' | 'payment_required';
interface SyncHealthState { status: SyncHealth; setStatus(status: SyncHealth): void; }
export const useSyncHealthStore = create<SyncHealthState>((set) => ({ status: 'offline', setStatus: (status) => set({ status }) }));
