# AGENTS.md

Dodo Payments documentation — a **Mintlify** docs site (MDX content, no app code). Live at docs.dodopayments.com.

## Critical: there is no package.json

This repo has **no `package.json`** (only a gitignored `package-lock.json`). Do not run `npm install`, `npm run`, or expect npm scripts. The toolchain is global CLIs + standalone scripts.

- Dev server: `mintlify dev` (serves at `localhost:3000`). Requires `docs.json` in cwd.
- The CLI is published as both `mintlify` and `mint`. CI uses `mint validate` (`npm install -g mint`); README uses `mintlify dev`. Treat them as the same tool, current name `mint`.
- Check broken links: `mintlify broken-links`.
- Helper scripts run directly with Node 24 (which strips TS types): `node scripts/<name>.ts`. They are written CommonJS-style (`require`) with `// @ts-nocheck` — do NOT convert to ESM/imports.

## Layout

Content is plain MDX organized by section, mirrored across 13 translated language folders:

- `features/`, `developer-resources/`, `api-reference/`, `integrations/`, `changelog/`, `miscellaneous/`, `community/` — English source content (lives at repo root, NOT in an `en/` folder).
- `ar/ cn/ de/ es/ fr/ hi/ id/ it/ ja/ ko/ pt-BR/ sv/ vi/` — machine-translated copies. **Never hand-edit these**; they are regenerated (see Translations).
- `docs.json` — Mintlify config + the entire navigation tree (11k+ lines, one `languages[]` entry per locale). Editing this is required for any new/moved/deleted page.
- `openapi/openapi.documented.yml` — 35k-line OpenAPI 3.1 spec. Source of truth for `api-reference/` pages.
- `scripts/` — i18n + page-hygiene tooling (TS, run via `node`).
- `images/`, `fonts/`, `logo/`, `styles.css`, `seo.js`, `favicon.svg` — assets.

### Where content lives

- `features/` — product & billing features (products, subscription, usage/credit/seat/hybrid billing, checkout, customers, payouts, MoR explainers). `usage-based-billing/` is a subdir.
- `developer-resources/` — guides, SDK docs (`sdks/`), framework adaptors & boilerplates, `webhooks/` (with `intents/` and `examples/`), `ingestion-blueprints/`, `billing-deconstructions/`.
- `integrations/` — flat dir of third-party integrations (Slack, Zapier, HubSpot, Resend, Segment, …). Grouped by type only in `docs.json`, not on disk.
- `api-reference/` — thin OpenAPI-bound stubs in per-resource subdirs (`products/`, `subscriptions/`, …).
- `changelog/` — one file per release, named `v<MAJOR>.<MINOR>.<PATCH>.mdx`; grouped by month in `docs.json`.
- `miscellaneous/`, `community/`, plus root pages `introduction.mdx` and `migrate-to-dodo.mdx`.

## Page conventions

- All content files are `.mdx` with frontmatter, kebab-case filenames (`payment-methods.mdx`).
- Every page MUST be registered in `docs.json` `navigation` or it 404s. New page → add it to the English `language: "en"` tabs/groups in `docs.json`.
- API reference pages are thin frontmatter stubs that bind to the OpenAPI spec, e.g.:
  ```
  ---
  openapi: get /products
  title: List Products
  description: Get a list of all products associated with your account.
  keywords: ["Dodo Payments", "API reference", "REST API", "list products"]
  ---
  ```
  To add/change an endpoint, edit `openapi/openapi.documented.yml` and the matching `api-reference/**/*.mdx` stub. API stubs omit `icon`/`sidebarTitle`.
- **No content reuse mechanism exists**: there are no shared snippets and no `snippets/` directory (the sync script lists one but it is not present). `import` statements in `.mdx` exist only inside code examples, never to pull in shared MDX. Each page is self-contained.

### Frontmatter

Required on every content page: `title`, `description`, `keywords`, `icon`. Usually also `sidebarTitle` when the title is long.

```
---
sidebarTitle: "Checkout"
title: "Checkout Features"
description: "Conversion-optimized, globally compliant checkout with multi-currency, multi-language support, automatic tax calculation, discount codes, add-ons, and smart address collection."
icon: "cart-shopping"
keywords: ["Dodo Payments", "checkout features", "payment platform", "SaaS billing"]
---
```

- `description` — one or two complete sentences, ~120–160 chars (it is the SEO meta description).
- `keywords` — YAML array, **always** starts with `"Dodo Payments"`, then 2–5 topic terms.
- `icon` — either a Mintlify icon name (FontAwesome-style kebab-case, e.g. `cart-shopping`, `credit-card`, `circle-question`, `chart-line`) **or** a logo path for integrations (`/images/logos/<service>.svg`).
- `tag` — optional status badge: `NEW`, `BETA`, or `DEPRECATED` (e.g. `tag: NEW`). Quoting is inconsistent in-repo; either form works.
- `noindex: true` — rare, suppresses SEO indexing for a page.
- These keys are locked from translation (`tag`, `openapi`, `api`, `icon` in `i18n.json`); the repair script restores them if a translation mangles them.

### Writing style

- Second person ("you"/"your") for the reader; imperative for instructions ("Go to", "Click", "Enter"); "we"/"our" only for the company's actions.
- Short, active sentences. **Title Case** for all headings.
- Typical page flow: optional hero `<Frame>` image → `<Info>`/intro paragraph → `<CardGroup>` of related links → H2 sections (concept → how it works → API/config) → closing `<CardGroup>`.
- Bold UI elements and dashboard paths (`**Settings → Business**`, `**Add Endpoint**`). Backticks for params, fields, values, env vars (`product_id`, `return_url`).
- Capitalize proper feature names: "Dodo Payments", "Merchant of Record", "Customer Portal", "Adaptive Currency".

### Components

Use Mintlify components, never raw HTML. Most used: `<Steps>/<Step>` (sequential setup), `<CardGroup cols={2}>/<Card icon href>` (nav, at top and bottom), `<Tabs>/<Tab>` and `<CodeGroup>` (multi-language code), `<Info> <Tip> <Warning> <Note> <Check>` callouts (Info most common), `<AccordionGroup>/<Accordion>` (FAQ/optional detail), `<Frame>` (images), `<ParamField>` (API fields). Mermaid diagrams appear in conceptual pages.

- **Images**: always `<Frame><img src="/images/<section>/<file>.png" alt="descriptive" style={{ maxHeight: '500px', width: 'auto' }} /></Frame>`. Absolute `/images/...` paths, kebab-case filenames, never a bare `<img>`.
- **Code blocks**: include a language tag; add `expandable` after it when >4 lines (` ```typescript expandable `). Use `<CodeGroup>` to show the same thing in Node.js / Python / cURL; tag with `lang Title` (e.g. ` ```typescript Node.js `).
- **Links**: internal links are absolute, extension-less paths (`/features/subscription`, `/api-reference/checkout-sessions/create`) — not `features/subscription.mdx`.

### Adding a changelog entry

1. Create `changelog/v<MAJOR>.<MINOR>.<PATCH>.mdx` with `title: "v1.102.0 (Month DD, YYYY)"` and the standard changelog `keywords`.
2. Body sections: `## New Features`, `## Bug Fixes`, `## Breaking Changes` as applicable.
3. Register it in `docs.json` under the right month group of the Changelog tab.

## Translations (do not edit language folders by hand)

Translation is automated via **lingo.dev** (`i18n.json` config, `i18n.lock` checksums). English at root is the only source you edit.

- Full sync: `node scripts/syncAllLanguages.ts` (needs `OPENAI_API_KEY`). It temporarily moves English content into an `en/` folder, runs lingo.dev, renames Lingo↔Mintlify codes (note `zh-CN` ↔ `cn`), repairs MDX, prunes orphaned/excluded files, updates `docs.json`, then moves English back. Flags: `--dry-run`, `--skip-lingo`, `--skip-cleanup`, `--skip-addUpdate`.
- Triggered in CI by the manual `Sync Languages` workflow (`.github/workflows/sync-languages.yml`), which opens a `sync-languages-*` PR.
- `node scripts/validateAndRepairTranslations.ts` — post-translation MDX repair (restores locked JSX tags, fixes split code fences, restores English-only frontmatter directives like `openapi`/`tag`/`icon`). `--self-test` runs its unit tests; `--langs ar,es` scopes it.
- `node scripts/addUpdateLanguage.ts [lang...]` — regenerates a locale's nav in `docs.json` from English, prefixing paths and dropping pages missing on disk.
- `miscellaneous/faq.mdx` is intentionally excluded from translation (see `i18n.json` + script exclude lists).

## Page hygiene scripts

- `node scripts/findMissingPages.ts` — lists `.mdx` files not referenced in `docs.json`.
- `node scripts/deleteNonIndexedPages.ts` — deletes unreferenced `.mdx`. Safe by default; `--dry-run` to preview, requires `--force`/`-f` to actually delete. Be careful: it scans the whole repo including language folders.

## SEO

`seo.js` injects global Organization + WebSite JSON-LD on all pages and a FAQPage schema parsed from the accordions on `/miscellaneous/faq`. `docs.json` holds the `redirects` array — add a redirect there whenever you rename or move a page (many existing `/guides/*` → new-path redirects show the pattern).

## Workflow

- Always test with `mintlify dev` before committing; run `mint validate` / `mintlify broken-links` for link/MDX checks.
- Commits follow conventional commits: `docs(...)`, `fix(...)`, `feat(...)`, `style(...)`, `refactor(...)`.
- Deployment is automatic on push to `main` (Mintlify). No build step to run locally.
- `AGENTS.md`, `.github/`, `node_modules/` are listed in `.mintignore` (excluded from the docs build).
