Source: https://github.com/ex-machina-co/opencode-anthropic-auth Vendored commit:
f9947c0c97f28b91036e2fd27f552578d888dfbc Published package:
@ex-machina/opencode-anthropic-auth@1.8.1 License: MIT

Vendored contents:

- src/
- dist/
- package.json
- LICENSE
- README.md

Local modifications:

- Patched plugin refresh logic to call the Open-Inspect control-plane endpoint
  (`/sessions/:id/anthropic-token-refresh`) using `CONTROL_PLANE_INTERNAL_URL`, `SESSION_ID`, and
  `INTERNAL_CALLBACK_SECRET`.
- Preserved the upstream request/header/system-prompt transform logic.
- Kept refresh token state managed centrally by the control plane instead of the sandbox plugin.
- **SQUIRRELS-PATCH (multi-account pool)**: when
  `process.env.MULTI_ACCOUNT_POOL_ENABLED !== "disabled"`, the inner fetch wrapper additionally (a)
  parses `anthropic-ratelimit-*` response headers and fires fire-and-forget POSTs to
  `/sessions/:id/anthropic-rate-limit-headers` and (b) on 401/429 responses POSTs to
  `/sessions/:id/anthropic-account-limit-hit` and persistently invalidates the cached token via
  `client.auth.set({...access:"",expires:0})` so the next request triggers a control-plane refresh
  that may repin to a healthy account. When the flag is `"disabled"` (the default), this block is
  skipped entirely and behavior is byte-identical to the upstream-patched version.
- Added `tsconfig.build.json` so `npm run build` produces a deterministic per-file emit (matches the
  layout previously baked into `dist/`).

Notes:

- The upstream repository does not ship a `plugin.json`; vendoring follows the published package
  layout plus source for auditability.
