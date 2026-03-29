# Project Context

## What this is

An accounting automation tool for UK sole traders in trades businesses (mechanics, plumbers, electricians, etc.).

## Goals

- Connect to the user's bank via Open Banking (TrueLayer) to pull in transactions automatically
- Use OCR (Google Vision) to extract data from receipts and invoices uploaded as photos
- Use AI (Claude) to categorise transactions into HMRC-relevant expense categories
- Match bank transactions to receipts/invoices for reconciliation
- Produce Self Assessment-ready summaries of income and allowable expenses

## Target users

Self-employed tradespeople in the UK: sole traders who need to submit a Self Assessment tax return each year but have limited time and accounting knowledge. They typically deal with:
- Cash and card payments from customers
- Tool, parts, and material purchases
- Van and fuel costs
- Subcontractor payments

## Regulatory context

- UK only — HMRC rules apply (Self Assessment, Making Tax Digital)
- Sole trader structure (not limited company)
- VAT may apply if turnover exceeds the threshold, but initial scope is pre-VAT registration

## Tech stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- **Database / Auth**: Supabase
- **AI**: Claude (Anthropic) for categorisation and data extraction
- **Open Banking**: TrueLayer
- **OCR**: Google Vision API
