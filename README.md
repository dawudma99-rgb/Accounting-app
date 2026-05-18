<div align="center">

# Accountancy Practice Automation

A production AI system for automated transaction categorisation, built on a retrieval-augmented architecture with two collaborating sources of truth.

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Claude_AI-D97706?style=flat-square&logo=anthropic&logoColor=white)](https://anthropic.com)

</div>

---

## What This Is

An internal automation system built for a UK accountancy practice. It ingests bank transaction data, classifies each transaction against HMRC expense categories, and routes the results to either automatic approval or an accountant review queue — depending on how confident the system is.

The goal is to move the accountant away from categorising every transaction and toward reviewing only the cases the system cannot confidently resolve. Currently running against a live client portfolio.

---

## The Core Architecture: Two Sources of Truth

Most AI-assisted tools treat the AI as the only authority. This system is built differently. Classification authority is split between two sources that operate in strict priority order:

**Source 1 — The Rules Cache (Supabase)**

A structured table of regex patterns, keyed by `(pattern, business_type)`, each carrying a confidence score, optional amount bounds, and an HMRC category. Every incoming transaction is tested against this table first.

This is deterministic, instant, and costs nothing to query.

**Source 2 — Claude Sonnet 4.6**

When the rules cache produces no match above the confidence threshold, the transaction is passed to Claude. Claude returns a structured JSON response: a category, a confidence score, a plain-English rationale, and — critically — a regex pattern and amount bounds that could describe this transaction in the future.

This is the generative fallback. It handles what the cache has not seen before.

**The bridge between them**

Every classification that an accountant approves — whether it came from Claude or was manually assigned — is upserted back into the rules cache at high confidence. The cache grows through use. Over time, the proportion of transactions that require a Claude call decreases, and the cost per batch falls accordingly.

Neither source alone is sufficient. The cache cannot handle what it has not been taught. Claude has no memory of prior decisions. Together, they form a system that is fast where it can be and intelligent where it must be.

```
Incoming transaction
        │
        ▼
┌───────────────────────┐
│  Rules Cache (Source 1)│  ◄── deterministic, zero-cost
│  Supabase regex match  │
└───────────┬───────────┘
            │
     Match ≥80%?
            │
    ┌───────┴───────┐
   Yes              No
    │               │
    ▼               ▼
Auto-apply    ┌─────────────────────┐
              │  Claude Sonnet 4.6  │  ◄── generative fallback
              │  (Source 2)         │
              └────────┬────────────┘
                       │
              Returns: category
                       + confidence
                       + rationale
                       + regex pattern  ──► upserted to cache
                       │
               Confidence ≥80%?
                       │
              ┌────────┴────────┐
             Yes               No
              │                 │
           Auto-apply    Review queue
                               │
                               ▼
                      Accountant reviews
                               │
                               ▼
                    Upserted to rules cache
                    (cache learns from human)
```

---

## Why This Is a RAG Architecture

Retrieval-Augmented Generation describes a pattern where a retrieval step runs before generation — reducing hallucination, grounding output in known facts, and lowering inference cost.

This system applies that pattern to classification:

- **Retrieval** — The rules cache is queried first. If a matching rule exists, its answer is used directly. No generation occurs.
- **Augmentation** — When retrieval fails, Claude's prompt is augmented with business-type context (HMRC categories, trade type, account metadata) so that generation is grounded in domain knowledge rather than general priors.
- **Generation** — Claude produces a structured classification plus a pattern that can be retrieved next time.
- **Index update** — The generated output is stored back into the retrieval index. The retrieval layer becomes more capable with every accountant-confirmed decision.

The feedback loop is what distinguishes this from a naive AI integration. The system does not repeat the same AI calls; it learns from them.

---

## Human-in-the-Loop Design

The accountant is the final authority. This is not a constraint worked around — it is a design requirement.

- Every classification records its source (`cache` or `claude`), its confidence score, and a plain-English rationale
- Low-confidence results are held in a review queue; nothing ambiguous is applied silently
- Accountant overrides are the primary quality signal — they feed directly back into the rules cache
- Every transaction has a complete, auditable decision path

In a compliance context, silent automation is a liability. Every decision must be traceable to either a deterministic rule or a human-approved AI suggestion.

---

## Features

**Transaction categorisation**
- Two-tier engine: rules cache first, Claude fallback second
- HMRC category mapping tuned per business type (`mechanic`, `plumber`, `taxi`)
- Confidence scoring and source attribution on every result
- Review queue for anything below the confidence threshold

**Client management**
- Multi-client dashboard with per-client transaction views
- Bulk import from Monzo CSV and Uber weekly payout files
- Per-client review and approval workflow

**Receipt matching**
- Receipt upload with OCR extraction (Vision API)
- Amount and date proximity matching against transaction records
- Reconciled receipts attached to their corresponding transaction

**Self-Assessment**
- Approved transactions aggregated to SA103 (self-employment) categories
- Full liability computation: income, expenses, Class 2/4 NI, income tax
- 2024/25 tax year config: mileage bands, NI thresholds, capital allowance rules

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 — App Router, Server Actions, Route Handlers |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | Supabase — PostgreSQL, Row Level Security, Auth |
| AI | Claude Sonnet 4.6 — categorisation, receipt OCR via Vision |
| Open Banking | TrueLayer |
| Deployment | Vercel |

---

## Project Structure

```
app/                          # Next.js App Router — routes and UI
  api/categorise/             # Streaming categorisation endpoint
  dashboard/                  # Client and transaction management

src/
  services/
    categorisation/
      engine.ts               # Two-tier RAG categorisation engine
    bankFeed/                 # Monzo CSV parsing
    platformFeed/             # Uber payout statement parsing
    matching/                 # Receipt-to-transaction reconciliation
    ocr/                      # Vision API receipt extraction
    tax/                      # Self-Assessment liability computation
    flags/                    # Review queue logic

  server/                     # Next.js Server Actions
    categorisation/           # Rule confirmation, receipt extraction
    transactions/             # Save, list, mark reviewed
    clients/                  # Client CRUD
    returns/                  # Tax return evaluation and workflow
    tax/                      # Liability computation

  lib/
    claude/                   # Anthropic SDK client
    supabase/                 # DB client (RLS-aware, server-safe)
    truelayer/                # Open banking client
    vision/                   # Google Vision client

  types/                      # Shared TypeScript interfaces
```

---

## Performance Targets

| Metric | Target |
|---|---|
| Transactions auto-categorised without review | ≥85% |
| Transactions escalated to review queue | ≤15% |
| Classification accuracy after accountant approval | ≥95% |
| Claude API cost per batch | Decreasing — tracked per run |

Accuracy is measured by override rate: how frequently the accountant changes a system suggestion. Confidence distributions are logged per batch to surface systematic errors early.

---

## Setup

**Prerequisites:** Node.js 18+, Supabase project, TrueLayer credentials, Anthropic API key.

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
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `TRUELAYER_CLIENT_ID` | TrueLayer client ID |
| `TRUELAYER_CLIENT_SECRET` | TrueLayer client secret |

---

<div align="center">
Built by <a href="https://github.com/dawudma99-rgb">dawudma99-rgb</a>
</div>
