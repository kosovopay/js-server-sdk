import type { ListResponse } from "./types.ts";

/** Fetches one page of results given an optional `starting_after` cursor. */
export type PageFetcher<T> = (
  startingAfter: string | undefined,
) => Promise<ListResponse<T>>;

/** Items the API paginates over expose an `id` used as the cursor. */
interface HasId {
  id: string;
}

/**
 * One page of a cursor-paginated list — and a lazy stream over *every* page.
 *
 * The single page is right there (`page.data`, `page.has_more`). When you want
 * the whole collection, iterate it: the `Page` is an `AsyncIterable` that walks
 * the current page, then transparently fetches the next, until the cursor runs
 * out.
 *
 * ```ts
 * // One page:
 * const page = await pay.payments.list({ status: "captured" });
 * console.log(page.data.length, page.has_more);
 *
 * // Every payment, one network round-trip at a time:
 * for await (const payment of await pay.payments.list({ status: "captured" })) {
 *   console.log(payment.id);
 * }
 * ```
 */
export class Page<T extends HasId> implements AsyncIterable<T> {
  readonly object = "list" as const;
  readonly data: T[];
  readonly has_more: boolean;
  readonly url: string;

  #fetchPage: PageFetcher<T>;

  constructor(first: ListResponse<T>, fetchPage: PageFetcher<T>) {
    this.data = first.data;
    this.has_more = first.has_more;
    this.url = first.url;
    this.#fetchPage = fetchPage;
  }

  /** Fetch the next page, or `null` when there is nothing more. */
  async nextPage(): Promise<Page<T> | null> {
    if (!this.has_more || this.data.length === 0) return null;
    const cursor = this.data[this.data.length - 1]!.id;
    const next = await this.#fetchPage(cursor);
    return new Page(next, this.#fetchPage);
  }

  /** Auto-paginating iterator over every item across all pages. */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> | null = this;
    while (page) {
      for (const item of page.data) yield item;
      page = await page.nextPage();
    }
  }

  /** Collect every item across every page into a single array. Use with care on large sets. */
  async toArray(): Promise<T[]> {
    const all: T[] = [];
    for await (const item of this) all.push(item);
    return all;
  }
}
