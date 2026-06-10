import type { HttpClient, RequestOptions } from "../client.ts";
import type { Me } from "../types.ts";

/** Identify the API key currently in use. */
export class Identity {
  #http: HttpClient;
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Resolve the calling key to its team, mode, enabled banks, and default
   * currency. A cheap, side-effect-free way to verify a key works.
   */
  retrieve(options?: RequestOptions): Promise<Me> {
    return this.#http.request<Me>({ method: "GET", path: "/me", options });
  }
}
