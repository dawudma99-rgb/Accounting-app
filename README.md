<div align="center">

# Accountancy Practice Automation

A production AI system for automated transaction categorisation, built on a retrieval-augmented architecture with semantic embeddings and two collaborating sources of truth.

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Claude_AI-D97706?style=flat-square&logo=anthropic&logoColor=white)](https://anthropic.com)
[![Voyage AI](https://img.shields.io/badge/Voyage_AI-6366F1?style=flat-square&logoColor=white)](https://www.voyageai.com)

</div>

---

## RAG Architecture

This system is built on a Retrieval-Augmented Generation pipeline. Before Claude is ever called, the system retrieves semantically similar past classifications from a vector store. Generation is the last resort — not the first.

The retrieval layer uses **Voyage AI** embeddings. Every transaction description is embedded using Voyage's finance-tuned model and stored in a **pgvector** index in Supabase. When a new transaction arrives, its embedding is compared against the index via cosine similarity. If a sufficiently similar past transaction exists — one that was previously classified and approved by an accountant — that classification is reused directly.

This is what makes the system genuinely retrieval-augmented rather than AI-wrapped:

- The retrieval index is built from **accountant-validated decisions**, not training data
- Semantic similarity catches variations that exact pattern matching misses — `AMAZON MKTPL*` and `AMZ*EU` are retrieved as the same merchant
- Every Claude-generated classification is embedded and added to the index, so future similar transactions never need a model call
- The index improves continuously through use, without retraining or human labelling effort

```
Incoming transaction
        │
        ▼
  Voyage AI embed
  (finance-tuned model)
        │
        ▼
┌──────────────────────────────┐
│  pgvector similarity search  │  ◄── semantic retrieval layer
│  Supabase vector index        │      cosine similarity against
│  (accountant-validated)       │      all prior approved decisions
└─────────────┬────────────────┘
              │
      Similarity ≥ threshold?
              │
      ┌───────┴────────┐
     Yes               No
      │                 │
      ▼                 ▼
 Apply cached     ┌──────────────────────────┐
 classification   │  Rules Cache (Source 2)   │  ◄── deterministic fallback
                  │  Supabase regex patterns  │      exact match, zero cost
                  └────────────┬─────────────┘
                               │
                       Match ≥80%?
                               │
                       ┌───────┴───────┐
                      Yes              No
                       │               │
                       ▼               ▼
                   Auto-apply    ┌─────────────────────┐
                                 │  Claude Sonnet 4.6   │  ◄── generative fallback
                                 │  (Source 3)          │      only called when
                                 └────────┬─────────────┘      retrieval fails
                                          │
                                 Returns: category
                                          + confidence
                                          + rationale
                                          + regex pattern
                                          │
                                 ┌────────┴────────────────┐
                                 │  Embed + store to index  │  ◄── index grows
                                 │  Upsert to rules cache   │      with each call
                                 └─────────────────────────┘
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
                                          ┌────────┴───────────────┐
                                          │  Embed + store to index │
                                          │  Upsert to rules cache  │
                                          └─────────────────────────┘
```

---

## Two Sources of Truth

Classification authority is split between two persistent knowledge stores. Neither is sufficient alone.

**Source 1 — The Vector Index (Voyage AI + pgvector)**

Every accountant-approved classification is embedded with Voyage AI and stored as a vector in Supabase. When a new transaction arrives, semantic similarity search retrieves the most relevant past decisions. This handles linguistic variation, merchant name truncation, and cross-client generalisation — things regex cannot.

**Source 2 — The Rules Cache (Supabase)**

A structured table of regex patterns keyed by `(pattern, business_type)`, each carrying a confidence score, optional amount bounds, and an HMRC category. This is the deterministic fallback when vector similarity is insufficient. Instant, cost-free, fully auditable.

**How they stay in sync**

Every accountant decision — whether it confirms a Claude suggestion or overrides one — is written to both stores simultaneously: embedded into the vector index and upserted as a regex rule into the rules cache. The two sources of truth are always consistent. They grow together, and the system's accuracy improves without any manual curation.

---

## Why Voyage AI

Generic embedding models are trained on web text. Transaction data is short, abbreviated, and domain-specific — `HMRC CUMBERNAULD`, `TSGN TICKETING`, `SQ *COFFEE WORKS` are not well-represented in general corpora.

Voyage AI's finance-tuned embedding model (`voyage-finance-2`) is trained on financial documents and transaction data. Embeddings for merchant names, payment references, and financial descriptions are meaningfully clustered — similar merchants land near each other in the embedding space even when their string representations differ significantly.

This is the difference between a similarity search that works on real transaction data and one that does not.

---

## Human-in-the-Loop Design

The accountant is the final authority. This is not a constraint worked around — it is the mechanism by which the system improves.

- Every classification records its source (`vector`, `cache`, or `claude`), confidence score, and rationale
- Low-confidence results are held in a review queue — nothing ambiguous is applied silently
- Accountant approvals and overrides are the write path for both knowledge stores
- Every transaction has a complete, auditable decision path from input to approved category

In a compliance context, silent automation is a liability. The system is built so that every decision is either deterministically retrieved from a prior human-approved classification or explicitly reviewed before it takes effect.

---

## Features

**Transaction categorisation**
- Three-tier RAG pipeline: vector retrieval → rules cache → Claude generation
- Voyage AI semantic embeddings for cross-client pattern generalisation
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
| Database | Supabase — PostgreSQL + pgvector, Row Level Security, Auth |
| Embeddings | Voyage AI — `voyage-finance-2`, finance-domain tuned |
| AI | Claude Sonnet 4.6 — categorisation fallback, receipt OCR via Vision |
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
      engine.ts               # Three-tier RAG categorisation engine
      embeddings.ts           # Voyage AI embed + pgvector search
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
    voyage/                   # Voyage AI client
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
| Claude API calls per batch | Decreasing — falls as vector index grows |
| Voyage AI embedding cost per transaction | Sub-cent at scale |

Accuracy is measured by override rate: how frequently the accountant changes a system suggestion. Vector index hit rate and Claude call frequency are logged per batch to track system maturity over time.

---

## Setup

**Prerequisites:** Node.js 18+, Supabase project with pgvector enabled, Voyage AI API key, Anthropic API key, TrueLayer credentials.

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
| `VOYAGE_API_KEY` | Voyage AI API key |
| `TRUELAYER_CLIENT_ID` | TrueLayer client ID |
| `TRUELAYER_CLIENT_SECRET` | TrueLayer client secret |

---

<div align="center">
Built by <a href="https://github.com/dawudma99-rgb">dawudma99-rgb</a>
</div>
