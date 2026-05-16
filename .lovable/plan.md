## Why it's still broken

Bahama Burger was accepted **before** the previous fix shipped. Its `prf_submissions.lead_id` is still `NULL`, even though the matching `sales_leads` row exists (`Morini Brands`, same email). The new accept-time logic only links *future* accepts — it never backfilled the existing card.

Confirmed in the DB:
- `prf_submissions`: Bahama Burger, `status=accepted`, `sales_stage=Follow-Up`, `lead_id=NULL`
- `sales_leads`: Morini Brands row exists with same email

So the card on the dashboard still renders as non-clickable (`!p.lead_id` → "accept in inbox").

## Fix

### 1. Backfill existing accepted PRFs (one-time migration)

```sql
UPDATE prf_submissions p
SET lead_id = l.id
FROM sales_leads l
WHERE p.lead_id IS NULL
  AND p.email IS NOT NULL
  AND lower(p.email) = lower(l.email);
```

This immediately makes Bahama Burger (and any other historical accepts) clickable.

### 2. Make the dashboard self-healing

In `SalesDashboard.load()`, after fetching projects, for any row where `lead_id` is null but `email` is set, look up the lead by email and patch `prf_submissions.lead_id` in the background. This guarantees we never get stuck again if a PRF ever lands without a lead link (e.g. accept flow fails halfway, manual DB insert, etc.).

Single batched query: `select id, email from sales_leads where lower(email) in (...)`, then `update prf_submissions set lead_id = ... where id = ...` per match. Update local state so cards become clickable without a page refresh.

### 3. No UI logic change

Cards already render as a real `<Link>` when `lead_id` is set — once #1 + #2 land, Bahama Burger becomes clickable on next load.

## Files

- `supabase/migrations/<new>.sql` — backfill query above.
- `src/pages/sales/SalesDashboard.tsx` — add self-heal pass inside `load()`.

## Out of scope

- Accept-flow code is already correct for new PRFs — no change there.
- No changes to `SalesDocumentsInbox`, `SalesProjectWorkspace`, or any edge function.
