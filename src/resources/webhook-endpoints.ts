import type { HttpClient, RequestOptions } from "../client.ts";
import type {
  DeletedResource,
  ListResponse,
  WebhookEndpoint,
  WebhookEndpointCreateParams,
} from "../types.ts";

/**
 * Manage the endpoints we POST signed events to. To *verify* incoming
 * deliveries, see {@link Webhooks} (`pay.webhooks`).
 */
export class WebhookEndpoints {
  #http: HttpClient;
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Register an endpoint. The response includes a `secret` (`whsec_…`) shown
   * **once** — store it; you verify every delivery with it.
   */
  create(
    params: WebhookEndpointCreateParams,
    options?: RequestOptions,
  ): Promise<WebhookEndpoint> {
    return this.#http.request<WebhookEndpoint>({
      method: "POST",
      path: "/webhook-endpoints",
      body: params,
      options,
    });
  }

  /** List registered webhook endpoints. */
  async list(options?: RequestOptions): Promise<WebhookEndpoint[]> {
    const res = await this.#http.request<ListResponse<WebhookEndpoint>>({
      method: "GET",
      path: "/webhook-endpoints",
      options,
    });
    return res.data;
  }

  /** Delete a webhook endpoint. */
  del(
    id: string,
    options?: RequestOptions,
  ): Promise<DeletedResource<"webhook_endpoint">> {
    return this.#http.request<DeletedResource<"webhook_endpoint">>({
      method: "DELETE",
      path: `/webhook-endpoints/${encodeURIComponent(id)}`,
      options,
    });
  }

  /**
   * Rotate the signing secret. The response includes the new `secret`
   * (`whsec_…`), shown once.
   */
  rotateSecret(id: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.#http.request<WebhookEndpoint>({
      method: "POST",
      path: `/webhook-endpoints/${encodeURIComponent(id)}/rotate-secret`,
      options,
    });
  }
}
