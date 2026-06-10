import type { HttpClient, RequestOptions } from "../client.ts";
import { Page } from "../pagination.ts";
import type {
  ListResponse,
  Refund,
  RefundCreateParams,
  RefundListParams,
} from "../types.ts";

/** Operations on refunds. */
export class Refunds {
  #http: HttpClient;
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Refund a captured payment. Omit `amount` for a full refund; pass it for a
   * partial (on banks whose capabilities allow partials).
   */
  create(params: RefundCreateParams, options?: RequestOptions): Promise<Refund> {
    return this.#http.request<Refund>({
      method: "POST",
      path: "/refunds",
      body: params,
      options,
    });
  }

  /** Retrieve a refund by id. */
  retrieve(id: string, options?: RequestOptions): Promise<Refund> {
    return this.#http.request<Refund>({
      method: "GET",
      path: `/refunds/${encodeURIComponent(id)}`,
      options,
    });
  }

  /** List refunds, optionally filtered to one payment. Auto-paginates when iterated. */
  async list(
    params: RefundListParams = {},
    options?: RequestOptions,
  ): Promise<Page<Refund>> {
    const fetchPage = (startingAfter: string | undefined) =>
      this.#http.request<ListResponse<Refund>>({
        method: "GET",
        path: "/refunds",
        query: { ...params, starting_after: startingAfter ?? params.starting_after },
        options,
      });
    return new Page(await fetchPage(undefined), fetchPage);
  }
}
