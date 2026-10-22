/**
 * Phase 5O-B — pagination contracts (server-agnostic).
 *
 * No B3 endpoint contract is assumed: pages are `{ items, nextCursor }`
 * regardless of whether the upstream uses cursors, offsets or date windows.
 * Collection is always bounded by `maxPages`; hitting the cap reports
 * `truncated: true` so the caller surfaces PARTIAL instead of a fake
 * complete sync.
 */
export interface B3Page<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface B3CollectOptions {
  maxPages?: number;
}

export interface B3CollectedPage<T> {
  items: T[];
  pages: number;
  truncated: boolean;
}

export async function collectB3Pages<T>(
  fetchPage: (cursor: string | null) => Promise<B3Page<T>>,
  options: B3CollectOptions = {},
): Promise<B3CollectedPage<T>> {
  const maxPages = Math.min(1_000, Math.max(1, Math.floor(options.maxPages ?? 100)));
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  for (;;) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    pages += 1;
    if (page.nextCursor === null) {
      return { items, pages, truncated: false };
    }
    if (pages >= maxPages) {
      return { items, pages, truncated: true };
    }
    cursor = page.nextCursor;
  }
}
