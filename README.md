<div align="center">

# Accountancy Practice Automation

Internal workflow tooling for transaction categorisation and client management.

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Claude_AI-D97706?style=flat-square&logo=anthropic&logoColor=white)](https://anthropic.com)

</div>

---

## Overview

A purpose-built internal system for a UK accountancy practice. It connects to client bank accounts via open banking, processes incoming transactions through a two-tier categorisation engine, and surfaces exceptions for accountant review.

The objective is to shift the accountant's role from full manual categorisation to exception handling — reviewing only what the system cannot confidently classify. Currently being trialled against a live client portfolio.

---

## Problem

Accountants managing multiple clients spend a disproportionate amount of time categorising bank transactions for bookkeeping and VAT returns. This work is:

- **High volume** — hundreds of transactions per client per month
- **Largely deterministic** — direct debits, recurring suppliers, and known payees follow predictable patterns
- **Poorly automated by existing tools** — legacy software requires full manual review or applies rigid rule matching that breaks on anything atypical

At scale, categorisation becomes the primary bottleneck in client throughput. It is also the kind of work that does not require accountant-level judgement for the majority of cases.

---

## Categorisation Engine

The engine operates in two tiers, ordered by cost and confidence.

**Tier 1 — Rules Cache**

Every transaction is matched against a `category_rules` table in Supabase, keyed by payee patterns, amounts, and account context. Matches at or above 80% confidence are applied automatically.

No AI call is made. Latency is sub-millisecond. Cost is zero.

**Tier 2 — Claude Fallback**

Transactions that fail to match, or fall below the confidence threshold, are sent to Claude claude-opus-4-6. The model returns a category, a confidence score, and a rationale. All three are stored alongside the result.

**Feedback Loop**

Accountant-approved classifications — whether confirmed Claude suggestions or manual overrides — are upserted back into the rules cache. The cache expands through use. As coverage grows, the proportion of transactions reaching Claude falls, and the cost per batch decreases accordingly.

```
Incoming transaction
        │
        ├── Rules cache match ≥80%? ──► Yes → apply, source: cache
        │
        └── No
             │
             ▼
        Claude claude-opus-4-6
        Returns: category + confidence + rationale
             │
             ├── High confidence ──► apply, source: claude
             │
             └── Low confidence ──► review queue
                       │
                       ▼
                Accountant reviews
                       │
                       ▼
             Upsert to rules cache
```

---

## Human-in-the-Loop Design

The accountant is the final authority on every classification. The system is built around this constraint, not despite it.

- All categorisations record their source (cache or Claude), confidence score, and rationale
- Low-confidence results are held in a review queue; nothing ambiguous is applied silently
- Accountant overrides are tracked and fed back into the cache — this is the primary quality signal
- Every transaction has a complete, traceable decision path

In a compliance context, silent automation is a liability. Human review is a design requirement, not a fallback.

---

## Design Principles

**Automate where confidence is high.** The rules cache handles the deterministic majority. Claude is reserved for the genuinely ambiguous minority.

**Escalate rather than guess.** Transactions below the confidence threshold are surfaced for review. The system does not apply low-confidence classifications silently.

**Auditability over throughput.** Every decision — automated or accountant-approved — is logged with its source, confidence, and rationale.

**Improve through feedback.** The system learns from accountant decisions without retraining. Confirmed classifications expand the rules cache and reduce future AI dependency.

**Minimise API cost through deterministic matching first.** Claude is only called when rule-based matching is insufficient. Cost per batch falls as cache coverage grows.

---

## Impact & Evaluation

Currently being measured against a live client portfolio. The following metrics define adequate performance:

| Metric | Target |
|---|---|
| Transactions auto-categorised without review | ≥85% |
| Transactions escalated to review queue | ≤15% |
| Classification accuracy after accountant approval | ≥95% |
| Time saved per client per month | Baseline in progress |
| Claude API cost per batch | Tracked per run; expected to fall as cache hit rate improves |

Accuracy is measured by override rate — how frequently an accountant changes a system suggestion. Confidence distributions are logged per batch to surface systematic errors.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 — App Router, Server Actions, Route Handlers |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | Supabase — PostgreSQL, Row Level Security, Auth |
| AI | Claude claude-opus-4-6 — categorisation and document OCR via Vision |
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
  lib/                      # Supabase client, TrueLayer wrappers
  types/                    # Shared TypeScript types
```

---

## Setup

**Prerequisites:** Node.js 18+, Supabase project, TrueLayer sandbox credentials, Anthropic API key.

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
