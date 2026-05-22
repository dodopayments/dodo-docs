import type { Plugin } from "@opencode-ai/plugin";
import { authorize, exchange } from "./auth.ts";
import {
  createStrippedStream,
  isInsecure,
  mergeHeaders,
  rewriteRequestBody,
  rewriteUrl,
  setOAuthHeaders,
} from "./transform.ts";

type AnthropicRefreshResponse = {
  access_token: string;
  expires_in?: number;
  account_id?: string;
};

async function computeHmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildInternalAuthHeader(secret: string): Promise<string> {
  const timestamp = Date.now().toString();
  const signature = await computeHmacHex(timestamp, secret);
  return `Bearer ${timestamp}.${signature}`;
}

function getAnthropicRefreshUrl(sessionId: string): string {
  const baseUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
  if (!baseUrl) {
    throw new Error("Missing CONTROL_PLANE_INTERNAL_URL for Anthropic OAuth refresh");
  }

  return new URL(
    `/sessions/${sessionId}/anthropic-token-refresh`,
    `${baseUrl.replace(/\/+$/, "")}/`
  ).toString();
}

async function refreshViaControlPlane(): Promise<AnthropicRefreshResponse> {
  const sessionId = process.env.SESSION_ID;
  const internalSecret = process.env.INTERNAL_CALLBACK_SECRET;

  if (!sessionId || !internalSecret) {
    throw new Error(
      "Missing environment for Anthropic token refresh: " +
        [!sessionId && "SESSION_ID", !internalSecret && "INTERNAL_CALLBACK_SECRET"]
          .filter(Boolean)
          .join(", ")
    );
  }

  const response = await fetch(getAnthropicRefreshUrl(sessionId), {
    method: "POST",
    headers: {
      Authorization: await buildInternalAuthHeader(internalSecret),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Token refresh failed: ${response.status} — ${body}`);
  }

  return response.json() as Promise<AnthropicRefreshResponse>;
}

function isMultiAccountPoolEnabled(): boolean {
  const v = process.env.MULTI_ACCOUNT_POOL_ENABLED;
  return typeof v === "string" && v !== "" && v !== "disabled";
}

function getControlPlanePostUrl(sessionId: string, path: string): string | null {
  const baseUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
  if (!baseUrl) return null;
  return new URL(`/sessions/${sessionId}${path}`, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

type ParsedRateHeaders = {
  util5h: number | null;
  util5hReset: number | null;
  util7d: number | null;
  util7dReset: number | null;
  unifiedStatus: string | null;
  retryAfter: number | null;
};

function parseAnthropicRateHeaders(headers: Headers): ParsedRateHeaders {
  const num = (v: string | null): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    util5h: num(headers.get("anthropic-ratelimit-unified-5h-utilization")),
    util5hReset: num(headers.get("anthropic-ratelimit-unified-5h-reset")),
    util7d: num(headers.get("anthropic-ratelimit-unified-7d-utilization")),
    util7dReset: num(headers.get("anthropic-ratelimit-unified-7d-reset")),
    unifiedStatus: headers.get("anthropic-ratelimit-unified-status"),
    retryAfter: num(headers.get("retry-after")),
  };
}

function hasAnyRateHeader(h: ParsedRateHeaders): boolean {
  return (
    h.util5h !== null ||
    h.util5hReset !== null ||
    h.util7d !== null ||
    h.util7dReset !== null ||
    h.unifiedStatus !== null
  );
}

async function postInternal(url: string, body: unknown): Promise<void> {
  const internalSecret = process.env.INTERNAL_CALLBACK_SECRET;
  if (!internalSecret) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: await buildInternalAuthHeader(internalSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Fire-and-forget: reporting failures must never break the agent loop.
  }
}

function reportRateLimitHeaders(accountId: string, h: ParsedRateHeaders): void {
  const sessionId = process.env.SESSION_ID;
  if (!sessionId) return;
  const url = getControlPlanePostUrl(sessionId, "/anthropic-rate-limit-headers");
  if (!url) return;
  void postInternal(url, {
    accountId,
    util5h: h.util5h,
    util5hReset: h.util5hReset,
    util7d: h.util7d,
    util7dReset: h.util7dReset,
    unifiedStatus: h.unifiedStatus,
  });
}

function reportAccountLimitHit(
  accountId: string,
  kind: "rate_limit" | "auth" | "session" | "weekly",
  httpStatus: number,
  bodySnippet: string,
  h: ParsedRateHeaders
): void {
  const sessionId = process.env.SESSION_ID;
  if (!sessionId) return;
  const url = getControlPlanePostUrl(sessionId, "/anthropic-account-limit-hit");
  if (!url) return;
  void postInternal(url, {
    accountId,
    kind,
    httpStatus,
    bodySnippet,
    util5h: h.util5h,
    util5hReset: h.util5hReset,
    util7d: h.util7d,
    util7dReset: h.util7dReset,
    unifiedStatus: h.unifiedStatus,
    retryAfter: h.retryAfter,
  });
}

function classifyLimitKind(
  status: number,
  unifiedStatus: string | null
): "rate_limit" | "auth" | "session" | "weekly" {
  if (status === 401) return "auth";
  const s = (unifiedStatus ?? "").toLowerCase();
  if (s.includes("weekly") || s.includes("7d")) return "weekly";
  if (s.includes("session") || s.includes("5h")) return "session";
  return "rate_limit";
}

export const AnthropicAuthPlugin: Plugin = async ({ client }) => {
  return {
    auth: {
      provider: "anthropic",
      async loader(
        getAuth: () => Promise<{
          type: string;
          access?: string;
          refresh?: string;
          expires?: number;
        }>,
        provider: { models: Record<string, { cost: unknown }> }
      ) {
        const auth = await getAuth();
        if (auth.type === "oauth") {
          // zero out cost for max plan
          for (const model of Object.values(provider.models)) {
            model.cost = {
              input: 0,
              output: 0,
              cache: {
                read: 0,
                write: 0,
              },
            };
          }

          // Shared inflight refresh promise — prevents concurrent token refreshes
          // from racing against each other (and causing 401 cascades with token rotation)
          let refreshPromise: Promise<string> | null = null;

          return {
            apiKey: "",
            async fetch(input: string | URL | Request, init?: RequestInit) {
              const auth = await getAuth();
              if (auth.type !== "oauth") return fetch(input, init);
              if (!auth.access || !auth.expires || auth.expires < Date.now()) {
                if (!refreshPromise) {
                  refreshPromise = (async () => {
                    const maxRetries = 2;
                    const baseDelayMs = 500;

                    for (let attempt = 0; attempt <= maxRetries; attempt++) {
                      try {
                        if (attempt > 0) {
                          const delay = baseDelayMs * 2 ** (attempt - 1);
                          await new Promise((resolve) => setTimeout(resolve, delay));
                        }

                        // Re-read auth to get the latest refresh token.
                        // The outer `auth` snapshot may be stale if tokens
                        // were rotated since the fetch() call was made.
                        const freshAuth = await getAuth();
                        const json = await refreshViaControlPlane();

                        // biome-ignore lint/suspicious/noExplicitAny: SDK types don't expose auth.set
                        await (client as any).auth.set({
                          path: {
                            id: "anthropic",
                          },
                          body: {
                            type: "oauth",
                            refresh: freshAuth.refresh || "managed-by-control-plane",
                            access: json.access_token,
                            expires: Date.now() + (json.expires_in ?? 3600) * 1000,
                            ...(json.account_id && { accountId: json.account_id }),
                          },
                        });

                        return json.access_token;
                      } catch (error) {
                        const isNetworkError =
                          error instanceof Error &&
                          (error.message.includes("fetch failed") ||
                            ("code" in error &&
                              (error.code === "ECONNRESET" ||
                                error.code === "ECONNREFUSED" ||
                                error.code === "ETIMEDOUT" ||
                                error.code === "UND_ERR_CONNECT_TIMEOUT")));

                        if (attempt < maxRetries && isNetworkError) {
                          continue;
                        }

                        throw error;
                      }
                    }
                    // Unreachable — each iteration either returns or throws.
                    // Kept as a TypeScript exhaustiveness guard.
                    throw new Error("Token refresh exhausted all retries");
                  })().finally(() => {
                    refreshPromise = null;
                  });
                }
                auth.access = await refreshPromise;
              }

              const requestHeaders = mergeHeaders(input, init);
              // biome-ignore lint/style/noNonNullAssertion: access is guaranteed set above
              setOAuthHeaders(requestHeaders, auth.access!);

              let body = init?.body;
              if (body && typeof body === "string") {
                body = rewriteRequestBody(body);
              }

              const rewritten = rewriteUrl(input);

              const response = await fetch(rewritten.input, {
                ...init,
                body,
                headers: requestHeaders,
                ...(isInsecure() && { tls: { rejectUnauthorized: false } }),
              });

              if (isMultiAccountPoolEnabled()) {
                const latest = (await getAuth()) as {
                  accountId?: string;
                  refresh?: string;
                  access?: string;
                };
                const accountId = typeof latest.accountId === "string" ? latest.accountId : "";
                if (accountId) {
                  const parsed = parseAnthropicRateHeaders(response.headers);
                  if (hasAnyRateHeader(parsed)) {
                    reportRateLimitHeaders(accountId, parsed);
                  }

                  if (response.status === 401 || response.status === 429) {
                    const cloned = response.clone();
                    const snippet = await cloned.text().catch(() => "");
                    reportAccountLimitHit(
                      accountId,
                      classifyLimitKind(response.status, parsed.unifiedStatus),
                      response.status,
                      snippet.slice(0, 500),
                      parsed
                    );

                    // Persistent invalidation: write through SDK so the next
                    // fetch sees expired tokens and refreshes via control-plane,
                    // which gives the pool a chance to repin to a healthy account.
                    // biome-ignore lint/suspicious/noExplicitAny: SDK types don't expose auth.set
                    await (client as any).auth.set({
                      path: { id: "anthropic" },
                      body: {
                        type: "oauth",
                        refresh: latest.refresh ?? "managed-by-control-plane",
                        access: "",
                        expires: 0,
                        ...(accountId && { accountId }),
                      },
                    });
                  }
                }
              }

              return createStrippedStream(response);
            },
          };
        }

        return {};
      },
      methods: [
        {
          label: "Claude Pro/Max",
          type: "oauth",
          authorize: async () => {
            const result = await authorize("max");
            return {
              url: result.url,
              instructions: "Paste the authorization code here:",
              method: "code",
              callback: async (code: string) => {
                return exchange(code, result.verifier, result.redirectUri, result.state);
              },
            };
          },
        },
        {
          label: "Create an API Key",
          type: "oauth",
          authorize: async () => {
            const result = await authorize("console");
            return {
              url: result.url,
              instructions: "Paste the authorization code here:",
              method: "code",
              callback: async (code: string) => {
                const credentials = await exchange(
                  code,
                  result.verifier,
                  result.redirectUri,
                  result.state
                );
                if (credentials.type === "failed") return credentials;
                const apiKey = await fetch(
                  `https://api.anthropic.com/api/oauth/claude_cli/create_api_key`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      authorization: `Bearer ${credentials.access}`,
                    },
                  }
                ).then((r) => r.json() as Promise<{ raw_key: string }>);
                return { type: "success" as const, key: apiKey.raw_key };
              },
            };
          },
        },
        {
          provider: "anthropic",
          label: "Manually enter API Key",
          type: "api",
        },
      ],
    },
    // biome-ignore lint/suspicious/noExplicitAny: Plugin type doesn't include undocumented auth/hooks
  } as any;
};
