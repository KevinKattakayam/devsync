/** Never retry a request that might have generated billable output. Factories resolve at stream admission. */
export async function openAiStream<T>(
  primary: (() => Promise<T>) | null,
  secondary: (() => Promise<T>) | null,
): Promise<T> {
  if (!primary) {
    if (secondary) return secondary();
    throw new Error('No configured AI provider');
  }
  try {
    return await primary();
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    if (secondary && [401, 403, 404].includes(Number(status))) return secondary();
    throw error;
  }
}
