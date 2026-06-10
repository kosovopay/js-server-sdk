import type { HttpClient, RequestOptions } from "../client.ts";
import type { Currency, ListResponse, Rate, RateParams } from "../types.ts";

/** Read access to enabled currencies and FX rates. */
export class Currencies {
  #http: HttpClient;
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** List currencies enabled for your team. */
  async list(options?: RequestOptions): Promise<Currency[]> {
    const res = await this.#http.request<ListResponse<Currency>>({
      method: "GET",
      path: "/currencies",
      options,
    });
    return res.data;
  }

  /**
   * Retrieve the current FX rate for a currency pair. `rate` is a decimal
   * string (never a float); check `stale` before relying on it.
   */
  rate(params: RateParams, options?: RequestOptions): Promise<Rate> {
    return this.#http.request<Rate>({
      method: "GET",
      path: "/rates",
      query: { from: params.from, to: params.to },
      options,
    });
  }
}
