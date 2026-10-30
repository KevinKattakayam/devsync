import { AsyncLocalStorage } from 'async_hooks';
export const requestScope = new AsyncLocalStorage<{ requestId: string }>();
