export type SupabaseFailure = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function throwOnSupabaseError(
  operation: string,
  error: SupabaseFailure | null,
): void {
  if (!error) {
    return;
  }
  const code = error.code ? ` (${error.code})` : '';
  throw new Error(`${operation} failed${code}: ${error.message}`);
}

export function requireSupabaseData<T>(
  operation: string,
  data: T | null,
): T {
  if (data === null) {
    throw new Error(`${operation} returned no data`);
  }
  return data;
}
