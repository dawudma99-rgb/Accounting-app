<div align="center">

# Accounting App

**AI-powered practice management for modern accountancy firms**

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Claude_AI-D97706?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)

</div>

---

## Overview

A full-stack practice management tool built for accountancy firms. Accountants can onboard clients, connect live bank feeds via open banking, and let an AI engine automatically categorise transactions — reducing manual data entry and accelerating month-end close.

This is not a client-facing product. It is an internal tool designed for the accountant's workflow.

---

## Key Features

- **Live Bank Feeds** — connects to client bank accounts via TrueLayer's open banking API; transactions sync automatically
- **AI Categorisation Engine** — a two-tier system: high-confidence transactions are matched from a Supabase rules cache; ambiguous ones are sent to Claude for classification, then fed back into the cache to improve future accuracy
- **Client Management** — full CRUD for client profiles, linked accounts, and transaction history
- **Vision Processing** — receipt and document parsing via Claude Vision to extract line items without manual entry
- **Role-aware UI** — built for accountants managing multiple clients, not end-consumers

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Next.js App Router              │
│         (Server Components + Route Handlers)     │
└───────────────┬─────────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
┌───────▼──────┐  ┌─────▼────────┐
│   Supabase   │  │  TrueLayer   │
│  (Postgres + │  │  Open Banking│
│   Auth +     │  │     API      │
│   Storage)   │  └─────┬────────┘
└───────┬──────┘        │
        │         Transactions
        │               │
        └───────┬───────┘
                │
   ┌────────────▼──────────────┐
   │   Categorisation Engine   │
   │                           │
   │  1. Check rules cache     │
   │     (≥80% confidence) ──► match → done
   │  2. Claude fallback    ──► classify → upsert cache
   └───────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 — App Router, Server Actions, Route Handlers |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth |
| AI | Claude claude-opus-4-6 (categorisation + vision) |
| Open Banking | TrueLayer |
| Deployment | Vercel |

---

## Project Structure

```
app/                  # Next.js routes (App Router)
src/
  services/
    categorisation/
      engine.ts       # Two-tier AI categorisation engine
  lib/                # Supabase client, TrueLayer SDK wrappers
  types/              # Shared TypeScript types
```

---

## Getting Started

**Prerequisites:** Node.js 18+, a Supabase project, TrueLayer sandbox credentials, and an Anthropic API key.

```bash
# Install dependencies
npm install

# Copy environment template and fill in credentials
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-side only) |
| `ANTHROPIC_API_KEY` | Claude API key |
| `TRUELAYER_CLIENT_ID` | TrueLayer client ID |
| `TRUELAYER_CLIENT_SECRET` | TrueLayer client secret |

---

<div align="center">
Built by <a href="https://github.com/dawudma99-rgb">dawudma99-rgb</a>
</div>
