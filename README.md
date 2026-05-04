<div align="center">

# Accounting App

**AI-assisted practice management for accountancy firms**

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Claude_AI-D97706?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)

</div>

---

## What This Is

An internal tool being trialled in a live accountancy workflow. Not a SaaS product — built specifically for accountants managing multiple clients who spend significant time on transaction categorisation for bookkeeping and VAT purposes.

The goal is to automate the high-volume, low-judgement parts of that process whilst keeping the accountant in control of anything ambiguous.

---

## The Problem

Categorising bank transactions is repetitive, error-prone, and does not scale well when managing multiple clients. Existing tools either require full manual review or apply rigid rule matching that breaks on edge cases. The result is a large portion of an accountant's time spent on data entry rather than advisory work.

---

## Categorisation Engine

The core of the system is a two-tier engine designed around a simple observation: most transactions are obvious in hindsight, but not all of them are obvious up front.

**Tier 1 — Rules Cache**

Incoming transactions are matched against a `category_rules` table in Supabase, keyed by payee patterns, amounts, and account context. Matches at or above the confidence threshold (≥80%) are applied automatically with no AI call. Sub-millisecond latency, no API cost.

**Tier 2 — Claude Fallback**

Transactions that fail to match, or match below the threshold, are sent to Claude claude-opus-4-6. Claude returns a category, a confidence score, and a brief rationale for the classification. This rationale is stored alongside the result for auditability.

**Feedback Loop**

When an accountant approves a Claude-generated classification, the decision is upserted back into the rules cache. Over time the cache grows to cover more cases, Claude is called less frequently, and the cost per batch decreases — without any retraining.

```
[TrueLayer Open Banking]
         │
         ▼
[Supabase — transactions table]
         │
         ▼
[Categorisation Engine]
         │
         ├── Rules cache match ≥80%? ──► Yes → apply, log source: cache
         │
         └── No match / low confidence
                  │
                  ▼
             Claude claude-opus-4-6
             Returns: category + confidence + rationale
                  │
                  ├── High confidence ──► apply, log source: claude
                  │
                  └── Low confidence ──► flag for accountant review queue
                                                │
                                                ▼
                                     Accountant approves
                                                │
                                                ▼
                                     Upsert to rules cache
```

---

## Human-in-the-Loop Design

The system proposes; the accountant decides.

- Every categorisation stores its source (cache or Claude), confidence score, and rationale
- Low-confidence results surface in a review queue rather than being applied silently
- Accountant overrides are tracked — this is the primary signal for measuring classification quality
- Nothing is treated as ground truth until a human has confirmed it

This is intentional. In a regulated context, auditability matters more than automation rate.

---

## Impact & Evaluation

Currently being baselined against a real client portfolio. The targets below define what "working well" looks like:

| Metric | Target |
|---|---|
| Transactions auto-categorised without review | ≥85% |
| Transactions flagged for accountant review | ≤15% |
| Accuracy rate after accountant approval | ≥95% |
| Time saved per client per month | Baseline being established |
| Claude API cost per categorisation run | Tracked per batch; falls as cache hit rate improves |

Accuracy is measured by the override rate — how often an accountant changes a suggestion. Classification confidence distributions are logged to identify systematic errors over time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 — App Router, Server Actions, Route Handlers |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | Supabase — PostgreSQL, Row Level Security, Auth |
| AI | Claude claude-opus-4-6 — categorisation and document OCR |
| Open Banking | TrueLayer |
| Deployment | Vercel |

---

## Project Structure

```
app/                        # Next.js routes (App Router)
src/
  services/
    categorisation/
      engine.ts             # Two-tier categorisation engine
  lib/                      # Supabase client, TrueLayer SDK wrappers
  types/                    # Shared TypeScript types
```

---

## Getting Started

**Prerequisites:** Node.js 18+, a Supabase project, TrueLayer sandbox credentials, and an Anthropic API key.

```bash
npm install
cp .env.example .env.local
npm run dev
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Claude API key |
| `TRUELAYER_CLIENT_ID` | TrueLayer client ID |
| `TRUELAYER_CLIENT_SECRET` | TrueLayer client secret |

---

<div align="center">
Built by <a href="https://github.com/dawudma99-rgb">dawudma99-rgb</a>
</div>
