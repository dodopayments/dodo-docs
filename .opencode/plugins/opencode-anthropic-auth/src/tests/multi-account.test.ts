import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AnthropicAuthPlugin } from "../index";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const EMPTY_POST = { method: "POST", body: "{}" } as const;

function createMockClient() {
  return {
    auth: {
      set: mock(() => Promise.resolve()),
    },
  };
}

function getPlugin(client?: ReturnType<typeof createMockClient>) {
  return AnthropicAuthPlugin({
    // @ts-expect-error: minimal mock for testing
    client: client ?? createMockClient(),
  }) as Promise<{
    auth: {
      loader: (
        getAuth: () => Promise<unknown>,
        provider: { models: Record<string, unknown> }
      ) => Promise<{ fetch: typeof fetch }>;
    };
  }>;
}

type CapturedRequest = { url: string; init?: RequestInit };

function makeAnthropicResponse(
  status: number,
  headers: Record<string, string> = {},
  body = "{}"
): Response {
  return new Response(body, {
    status,
    headers: new Headers({ "content-type": "application/json", ...headers }),
  });
}

function captureFetch() {
  const captured: CapturedRequest[] = [];
  const fetchMock = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    captured.push({ url, init });

    if (url.endsWith("/anthropic-rate-limit-headers")) {
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/anthropic-account-limit-hit")) {
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/anthropic-token-refresh")) {
      return new Response(
        JSON.stringify({ access_token: "new-access", expires_in: 3600, account_id: "acct-1" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return makeAnthropicResponse(200, {
      "anthropic-ratelimit-unified-5h-utilization": "0.5",
      "anthropic-ratelimit-unified-5h-reset": "1700000000",
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { captured, fetchMock };
}

describe("auth.loader multi-account pool integration", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    MULTI_ACCOUNT_POOL_ENABLED: process.env.MULTI_ACCOUNT_POOL_ENABLED,
    SESSION_ID: process.env.SESSION_ID,
    CONTROL_PLANE_INTERNAL_URL: process.env.CONTROL_PLANE_INTERNAL_URL,
    INTERNAL_CALLBACK_SECRET: process.env.INTERNAL_CALLBACK_SECRET,
  };

  beforeEach(() => {
    process.env.SESSION_ID = "sess-abc";
    process.env.CONTROL_PLANE_INTERNAL_URL = "https://control.test";
    process.env.INTERNAL_CALLBACK_SECRET = "test-secret";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("does nothing extra when flag is disabled (byte-identical to legacy)", async () => {
    process.env.MULTI_ACCOUNT_POOL_ENABLED = "disabled";
    const { captured } = captureFetch();
    const plugin = await getPlugin();
    const result = await plugin.auth.loader(
      () =>
        Promise.resolve({
          type: "oauth",
          access: "tok",
          refresh: "ref",
          expires: Date.now() + 100000,
          accountId: "acct-1",
        }),
      { models: {} }
    );

    await result.fetch(MESSAGES_URL, EMPTY_POST);

    const controlPlaneCalls = captured.filter(
      (c) =>
        c.url.includes("/anthropic-rate-limit-headers") ||
        c.url.includes("/anthropic-account-limit-hit")
    );
    expect(controlPlaneCalls).toHaveLength(0);
  });

  test("reports rate limit headers on 200 when flag is enabled and account is known", async () => {
    process.env.MULTI_ACCOUNT_POOL_ENABLED = "shadow";
    const { captured } = captureFetch();
    const plugin = await getPlugin();
    const result = await plugin.auth.loader(
      () =>
        Promise.resolve({
          type: "oauth",
          access: "tok",
          refresh: "ref",
          expires: Date.now() + 100000,
          accountId: "acct-1",
        }),
      { models: {} }
    );

    await result.fetch(MESSAGES_URL, EMPTY_POST);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const reportCalls = captured.filter((c) => c.url.endsWith("/anthropic-rate-limit-headers"));
    expect(reportCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(reportCalls[0].init?.body as string);
    expect(body.accountId).toBe("acct-1");
    expect(body.util5h).toBe(0.5);
  });

  test("skips reporting when accountId is missing", async () => {
    process.env.MULTI_ACCOUNT_POOL_ENABLED = "primary";
    const { captured } = captureFetch();
    const plugin = await getPlugin();
    const result = await plugin.auth.loader(
      () =>
        Promise.resolve({
          type: "oauth",
          access: "tok",
          refresh: "ref",
          expires: Date.now() + 100000,
        }),
      { models: {} }
    );

    await result.fetch(MESSAGES_URL, EMPTY_POST);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const reportCalls = captured.filter(
      (c) =>
        c.url.endsWith("/anthropic-rate-limit-headers") ||
        c.url.endsWith("/anthropic-account-limit-hit")
    );
    expect(reportCalls).toHaveLength(0);
  });

  test("on 429 reports account_limit_hit AND invalidates auth via client.auth.set", async () => {
    process.env.MULTI_ACCOUNT_POOL_ENABLED = "primary";
    const mockClient = createMockClient();
    const captured: CapturedRequest[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      captured.push({ url, init });
      if (url.endsWith("/anthropic-account-limit-hit")) return new Response("{}", { status: 200 });
      if (url.endsWith("/anthropic-rate-limit-headers")) return new Response("{}", { status: 200 });
      return makeAnthropicResponse(
        429,
        {
          "anthropic-ratelimit-unified-status": "session_limit_exceeded",
          "retry-after": "120",
        },
        '{"error":"rate_limited"}'
      );
    }) as unknown as typeof fetch;

    const plugin = await getPlugin(mockClient);
    const result = await plugin.auth.loader(
      () =>
        Promise.resolve({
          type: "oauth",
          access: "tok",
          refresh: "ref",
          expires: Date.now() + 100000,
          accountId: "acct-1",
        }),
      { models: {} }
    );

    await result.fetch(MESSAGES_URL, EMPTY_POST);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const hitCalls = captured.filter((c) => c.url.endsWith("/anthropic-account-limit-hit"));
    expect(hitCalls).toHaveLength(1);
    const hitBody = JSON.parse(hitCalls[0].init?.body as string);
    expect(hitBody.accountId).toBe("acct-1");
    expect(hitBody.kind).toBe("session");
    expect(hitBody.httpStatus).toBe(429);
    expect(hitBody.retryAfter).toBe(120);

    expect(mockClient.auth.set).toHaveBeenCalledTimes(1);
    const setArg = mockClient.auth.set.mock.calls[0][0] as {
      body: { access: string; expires: number; accountId?: string };
    };
    expect(setArg.body.access).toBe("");
    expect(setArg.body.expires).toBe(0);
    expect(setArg.body.accountId).toBe("acct-1");
  });

  test("on 401 reports kind=auth and invalidates", async () => {
    process.env.MULTI_ACCOUNT_POOL_ENABLED = "primary";
    const mockClient = createMockClient();
    const captured: CapturedRequest[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      captured.push({ url, init });
      if (url.endsWith("/anthropic-account-limit-hit")) return new Response("{}", { status: 200 });
      if (url.endsWith("/anthropic-rate-limit-headers")) return new Response("{}", { status: 200 });
      return makeAnthropicResponse(401, {}, '{"error":"unauthorized"}');
    }) as unknown as typeof fetch;

    const plugin = await getPlugin(mockClient);
    const result = await plugin.auth.loader(
      () =>
        Promise.resolve({
          type: "oauth",
          access: "tok",
          refresh: "ref",
          expires: Date.now() + 100000,
          accountId: "acct-1",
        }),
      { models: {} }
    );

    await result.fetch(MESSAGES_URL, EMPTY_POST);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const hitCalls = captured.filter((c) => c.url.endsWith("/anthropic-account-limit-hit"));
    expect(hitCalls).toHaveLength(1);
    const hitBody = JSON.parse(hitCalls[0].init?.body as string);
    expect(hitBody.kind).toBe("auth");
    expect(mockClient.auth.set).toHaveBeenCalledTimes(1);
  });
});
