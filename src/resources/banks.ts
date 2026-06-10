import type { HttpClient, RequestOptions } from "../client.ts";
import type { Bank, ListResponse } from "../types.ts";

/** Read access to the banks enabled for your team. */
export class Banks {
  #http: HttpClient;
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** List enabled banks and their capabilities. */
  async list(options?: RequestOptions): Promise<Bank[]> {
    const res = await this.#http.request<ListResponse<Bank>>({
      method: "GET",
      path: "/banks",
      options,
    });
    return res.data;
  }

  /** Retrieve a single bank by its `code` (e.g. `"onefor"`). */
  retrieve(code: string, options?: RequestOptions): Promise<Bank> {
    return this.#http.request<Bank>({
      method: "GET",
      path: `/banks/${encodeURIComponent(code)}`,
      options,
    });
  }
}
