import type { HttpClient, RequestOptions } from "../client.ts";
import { Page } from "../pagination.ts";
import type {
  ListResponse,
  Payment,
  PaymentCreateParams,
  PaymentListParams,
  TimelineEvent,
} from "../types.ts";

/** Operations on payments — the core of the orchestrator. */
export class Payments {
  #http: HttpClient;
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Create a payment.
   *
   * The response carries a `hosted_url` (for `mode: "hosted"`) or a
   * `redirect_url` (for `mode: "direct"`) — send the customer there. Never
   * trust the browser redirect for fulfilment; confirm with a webhook or
   * `retrieve()` server-side.
   */
  create(
    params: PaymentCreateParams,
    options?: RequestOptions,
  ): Promise<Payment> {
    return this.#http.request<Payment>({
      method: "POST",
      path: "/payments",
      body: params,
      options,
    });
  }

  /** Retrieve a payment by id. */
  retrieve(id: string, options?: RequestOptions): Promise<Payment> {
    return this.#http.request<Payment>({
      method: "GET",
      path: `/payments/${encodeURIComponent(id)}`,
      options,
    });
  }

  /** List payments. Returns one page that auto-paginates when iterated. */
  async list(
    params: PaymentListParams = {},
    options?: RequestOptions,
  ): Promise<Page<Payment>> {
    const fetchPage = (startingAfter: string | undefined) =>
      this.#http.request<ListResponse<Payment>>({
        method: "GET",
        path: "/payments",
        query: { ...params, starting_after: startingAfter ?? params.starting_after },
        options,
      });
    return new Page(await fetchPage(undefined), fetchPage);
  }

  /** Cancel a payment that has not yet been captured. */
  cancel(id: string, options?: RequestOptions): Promise<Payment> {
    return this.#http.request<Payment>({
      method: "POST",
      path: `/payments/${encodeURIComponent(id)}/cancel`,
      options,
    });
  }

  /** Retrieve the ordered audit trail of state transitions for a payment. */
  async timeline(
    id: string,
    options?: RequestOptions,
  ): Promise<TimelineEvent[]> {
    const res = await this.#http.request<ListResponse<TimelineEvent>>({
      method: "GET",
      path: `/payments/${encodeURIComponent(id)}/timeline`,
      options,
    });
    return res.data;
  }
}
