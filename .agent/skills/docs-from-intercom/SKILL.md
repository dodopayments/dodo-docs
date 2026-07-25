---
name: docs-from-intercom
description: Mine past Intercom support conversations to find documentation gaps and turn recurring customer questions into Mintlify docs changes. Use when asked to update docs from support tickets, close doc gaps from Intercom, find what customers keep asking, or refresh the docs from support history.
---

# docs-from-intercom

If customers keep asking support the same question, the docs failed to answer it. Support history
is the highest-signal backlog of documentation gaps that exists — roughly 3.2k closed and 400 open
conversations.

This skill turns that backlog into docs changes without leaking private data into a public repo.

## The Core Risk: Read This First

**This repository is public. The support corpus is private.** This work moves information across
that boundary, in one direction, permanently.

Git history is append-only in practice. A customer's email committed today and removed tomorrow is
still in the public history, in every clone, and in GitHub's API. Remediation means rewriting
history on a public repo and rotating credentials. There is no clean undo.

So the rule is **not** "strip PII before committing". It is:

> Nothing from a conversation is published verbatim. Docs are written from the *general lesson*,
> never from the *case*.

If you cannot state the lesson without the customer's specifics, you do not yet understand it well
enough to document it.

## Access Facts

- **Docs live in this repo, not in Intercom.** The deliverable is an MDX change plus a `docs.json`
  update where needed — never an Intercom Help Center edit.
- **The token is conversation-scoped.** `search` and `get_conversation` work. `list_articles` and
  `search_articles` return `token_unauthorized`. Do not plan around Help Center access.
- **Conversation timestamps are Unix seconds.** The search DSL takes Unix seconds or `YYYY-MM-DD`.
  Convert programmatically, never mentally.
- **Bodies are HTML** — expect `<p>`, `<div>`, `&amp;`, inline `<img>`.

## The Highest-Value Signal

Many conversations carry an automated internal briefing note (`part_type: "note"`, authored by the
support tooling bot) containing:

- **Intent** — a normalized one-line statement of what the customer actually wanted.
- **Docs** — the docs.dodopayments.com pages the retrieval layer judged relevant.
- **Past cases** — similar prior conversations with similarity scores, e.g. `[0.75]`.

Read these first; they are pre-computed gap detection.

- 3+ past cases above ~0.65 means the question recurs, by definition.
- If the linked docs pages **exist** and the customer still had to ask, the page is *inadequate* —
  extend it rather than adding a new one.
- If no relevant docs are listed, the topic is likely genuinely undocumented.

## Workflow

### 1. Scope the mine

Agree a time window and topic before querying. Unscoped mining wastes calls and pulls PII for no
reason. Prefer `state:closed` — closed conversations contain the resolved answer.

```
object_type:conversations state:closed created_at:gt:<unix_seconds> limit:50
object_type:conversations source_subject:contains:"payout" state:closed
object_type:conversations source_body:contains:"webhook" limit:50
```

### 2. Cluster by theme

Group by the underlying question, not the wording. Use conversation `tags` (`Verification / KYC`,
`Product Setup`, `Payouts`, `General`) and the briefing **Intent** lines as the clustering key.
Produce a ranked list with a supporting count for each candidate gap.

### 3. Apply the evidence threshold

Only write a doc change when at least one holds:

- 3+ independent conversations ask substantially the same question, or
- a briefing shows 3+ past cases above ~0.65 similarity, or
- the user explicitly asked for this topic.

One conversation is an anecdote — report it as a candidate instead of reshaping the docs around it.

This threshold is also a **privacy control**: writing only from patterns seen across several
unrelated merchants makes attribution to any one of them structurally impossible.

### 4. Extract and verify the answer

The answer is in the **admin `part_type: "comment"` parts** — the human agent's reply. Bot parts
are autoresponders; notes are internal.

Then verify before writing. A support reply is one agent's phrasing on one day, and may be wrong,
stale, or specific to that account:

- API behaviour → check `openapi/openapi.documented.yml`.
- Product or policy claims → check existing pages in `features/` or `miscellaneous/`.
- If agents gave **contradictory** answers, stop and surface the conflict. Do not pick one and
  codify it.

Never document something on support-reply authority alone.

### 5. Place the change

- Prefer extending an existing page. A recurring question usually means a page is incomplete, not
  missing.
- FAQ-shaped → `miscellaneous/faq.mdx` (excluded from translation by design).
- Conceptual/policy → `features/` or `miscellaneous/`.
- Integration/SDK → `developer-resources/`.
- New page → register it in `docs.json` under the `language: "en"` navigation, or it 404s.
- Moved/renamed page → add a redirect to `redirects` in `docs.json`.

Follow `AGENTS.md`: required frontmatter (`title`, `description`, `keywords` starting with
`"Dodo Payments"`, `icon`), Title Case headings, second person, Mintlify components over raw HTML,
absolute extension-less internal links.

**English only.** Never hand-edit `ar/ cn/ de/ es/ fr/ hi/ id/ it/ ja/ ko/ pt-BR/ sv/ vi/` — those
are regenerated by `scripts/syncAllLanguages.ts`.

### 6. Validate and check for leaks

```bash
mint validate
mintlify broken-links
```

Then run the pre-commit check below.

## What Must Never Be Published

**Customer identity** — names, emails, phone numbers, addresses, company or product names,
domains, tax IDs, bank details, account screenshots.

**Internal identifiers and systems** — Intercom conversation/contact/company IDs, `app.intercom.com`
links, signed `intercom-attachments-*` URLs (they expire and leak the tenant), internal team,
queue, or tooling names.

**Staff identity** — agents' names and addresses appear throughout conversation parts. Public docs
reference official aliases only (`support@dodopayments.com`), never individuals.

**Business-confidential data** — revenue, `monthly_spend`, merchant volumes, customer counts,
negotiated pricing, named-customer anecdotes.

**Unreleased or unpromised functionality** — support replies routinely say "that's coming soon" or
"we can enable that for you". Roadmap and one-off accommodations are not documentation.

**Abuse-enabling control details** — the highest-stakes category for a payments company. Fraud and
risk thresholds, manual-review trigger amounts, KYC bypass conditions, velocity limits,
chargeback internals. "Transactions above $X get manual review" is a roadmap for staying under $X.
Document that a control exists; never where it triggers.

**Live credentials** — customers paste real API keys and webhook secrets into tickets. These are
active secrets. Never copy one anywhere. Report it for rotation and move on.

## Re-Identification: Redaction Is Not Enough

Removing the name does not anonymize the case. A specific enough scenario identifies one merchant
to anyone who can search. Distinctive verbatim phrasing is worst — it is directly searchable back
to the customer's site or listing.

Test before publishing any example:

> If a reader searched these details, could they land on one identifiable business?

The rows below use a **fabricated** merchant. Never build an example from a conversation you read.

| Source (invented) | Still unsafe | Safe |
| --- | --- | --- |
| "NorthPeak Robotics, a Finnish firm selling drone-survey subscriptions to 40 mining clients" | "a Finnish drone-survey SaaS with 40 mining clients" — still one company | "a business selling subscription access to a data service" |
| "your €1,800 on-site training package bundles hotel nights" | "a €1,800 training package bundled with hotel stays" | "fees that bundle in-person services with accommodation" |
| "ops@northpeak-robotics.fi" | initials, or a lookalike domain | omit entirely |

## Synthetic Examples Only

- Use placeholder IDs (`pdt_xxxxxxxxxxxx`, `cus_xxxxxxxxxxxx`) or test-account values. Never reuse
  an identifier seen in a conversation, even if it looks harmless.
- Use `@example.com` addresses.
- Recreate screenshots in test mode with synthetic data. Never crop a customer's screenshot —
  cropping leaves surrounding account context, and image metadata may persist.

## Pre-Commit Check

Run against the staged diff. Advisory, not a gate:

```bash
git diff --cached -U0 | grep -E '^\+' | grep -vE '^\+\+\+' \
| grep -ohE \
  -e '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  -e '[A-Za-z0-9.-]*intercom(-attachments-[0-9]+)?\.(com|io)[^ )"`*]*' \
  -e '(sk|pk|whsec|rk)_[A-Za-z0-9_-]{8,}' \
  -e 'Bearer +[A-Za-z0-9._-]{12,}' \
| grep -viE \
  -e '@(example\.[a-z]+|.*yourdomain\.com|yourcompany\.com|company\.com|acme\.com|startup\.com|email\.com|test\.com|resend\.dev|dodopayments\.com)' \
  -e '(YOUR|your)_[A-Za-z_]+' \
  -e '^(app\.|mcp\.)?intercom\.(com|io)$' \
| sort -u
```

A typical small diff should produce nothing. The docs already contain a handful of example
addresses on unusual domains that will surface if you touch those files — justify each hit
individually rather than widening the filter.

Two limits to keep in mind:

1. `git diff` does **not** report untracked files. If you created a new page, either `git add` it
   first or check it directly — otherwise a brand-new file is never scanned.
2. The check cannot see the dangerous leaks. A re-identifiable anecdote, a published threshold, or
   an unreleased feature contains no distinctive pattern. **Reread the diff yourself.**

Also check the branch name, commit message, and PR body. All three are public.
`fix/acme-corp-tax-id` leaks a customer; name branches after the topic.

## Reporting

Report to the user in chat. Chat is the private channel, so evidence may be cited here — and must
not be copied into the commit or PR.

```text
Mined: 50 closed conversations, 2026-06-01 → 2026-07-25, topic: KYC/verification

Gaps found (ranked):
1. Tax ID format rejected at signup — 4 unrelated merchants (top similarity 0.75)
   evidence: conv <ids>   [chat only — never in the PR]
   → miscellaneous/verification-process.mdx lists no accepted formats
2. ...

Changed:
- miscellaneous/verification-process.mdx — added "Accepted Tax ID Formats" section
- docs.json — no nav change required

Verified against: existing verification-process.mdx (no OpenAPI surface)
Not actioned: 3 single-instance questions (below evidence threshold)
Withheld: 1 gap concerns a manual-review threshold — escalated, not documented
Leak check: clean | branch/commit/PR text checked
Validation: mint validate passed
```

Then post the same summary to **`#squirrels-dev`** with the PR link.

Slack is internal, so it may carry what the public PR must not: gap counts, similarity scores, and
conversation IDs as internal references. It is still not a place for customer PII — Slack messages
are retained, exported, and searchable. Lead with what needs a human: anything withheld or
escalated. A run that found nothing still deserves a short "no gaps above threshold", so silence is
never ambiguous between *clean* and *broken*.

## If Run On A Schedule

A weekly unattended run is strictly riskier than a human-driven one, because nobody sees the
intermediate steps. If this is automated, these are the minimum conditions:

- **Draft PRs only, never auto-merged.** A human reviews before anything is merged.
- **The leak check becomes a hard gate** that runs before any push. On a hit: fail, push nothing,
  alert `#squirrels-dev`. Nothing reaches a public branch.
- **Deny the agent shell and network access.** Let it edit files and call the Intercom MCP only, so
  it cannot run git or POST data out. The automation performs all git operations.
- **Bound the scope** — one week, capped conversations, at most a few gaps per run, so PRs stay
  reviewable.
- **Provide a kill switch** that disables the run without deleting it.

The evidence threshold matters more here than in a manual run. With no human to catch an over-eager
change mid-flight, an uncertain automated run must leave the gap out and report it instead.

## Escalate Instead of Guessing

Stop and ask when:

- A useful example cannot be generalized without becoming meaningless.
- The information may be an internal threshold, risk control, or unreleased feature.
- A live credential appears in a conversation (flag it for rotation).
- Support answers contradict each other or the OpenAPI spec.
- Publishing would state policy the docs have never stated. Public policy statements carry legal
  and compliance weight and are the user's call, not yours.

"Leave it out and ask" costs one round trip. "Publish and fix later" costs a public-history rewrite.

## Guardrails

Disclosure — public repo, unretractable:

- No customer PII, company names, or anything re-identifiable to one merchant.
- No internal identifiers, Intercom links, attachment URLs, or internal system names — in content,
  commits, branch names, or PR text.
- No individual staff names; official aliases only.
- No revenue, volume, negotiated pricing, or named-customer anecdotes.
- No fraud, risk, or manual-review thresholds. The control exists; where it triggers does not ship.
- No unreleased features or one-off accommodations promised in a ticket.
- Never copy a live credential anywhere; report it for rotation.
- Never reuse identifiers or screenshots from conversations; synthesize them.
- Never reproduce a support reply verbatim — distinctive phrasing is searchable.
- Never write conversation data into the repo working tree, even as scratch. Use `/tmp`; one
  `git add -A` is all it takes.
- Never fix a leak with a follow-up commit. Stop and escalate — public history needs a rewrite.

Content quality:

- No doc change from a single conversation.
- A support reply is not source of truth for API or policy behaviour.
- Do not invent policy to resolve contradictory answers; escalate.
- Extend an existing page rather than adding a near-duplicate.
- Register every new page in `docs.json`.
- Never edit translated language folders.
- Do not claim validation passed unless `mint validate` actually ran.
- Never page through the whole corpus; scope every query.
