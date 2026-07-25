/** Run `fn`, retrying with exponential backoff. Throws if all attempts fail. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries: number; baseDelayMs: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === options.retries) break;
      const delay = options.baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
