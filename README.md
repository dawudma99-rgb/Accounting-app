# Accounting App

A practice management tool for accountancy firms. Built to help accountants manage clients, transactions, and financial categorisation in one place.

## Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4
- **Database:** Supabase
- **AI:** Claude (transaction categorisation)
- **Open Banking:** TrueLayer

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/          # Next.js routes and pages
src/          # Business logic and services
  services/
    categorisation/   # AI-powered transaction categorisation engine
```

## Environment Variables

Create a `.env.local` file with your Supabase, Claude, and TrueLayer credentials. See `.env.example` for required keys.
