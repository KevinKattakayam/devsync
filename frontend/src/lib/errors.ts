import { isAxiosError } from 'axios';

export function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === 'string') return error.response.data.error;
  return error instanceof Error ? error.message : fallback;
}
