export async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown };
        if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
        if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
      } catch {
        return `${error instanceof Error ? error.message : fallback} (HTTP ${context.status})`;
      }
    }
  }

  return error instanceof Error ? error.message : fallback;
}