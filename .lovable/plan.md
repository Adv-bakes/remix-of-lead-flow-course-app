## Sales workflow — what we're actually building

A clean, decision-driven sales surface. PRFs land → salesperson reviews → Accept or Reject → client either becomes a folder you live inside, or gets archived with a polite AI-drafted email. No fake dollar signs anywhere.

## Core mental model

```text
PRF submitted (public form)
      │
      ▼
┌───────────────┐    Accept     ┌────────────────────────┐
│ Documents     │ ───────────▶ │ Client Folder (micro app)│
│ Inbox (queue) │               │ → stage: Send Documents │
│  - Open PRF   │   Reject      └────────────────────────┘
│  - Read it    │ ──────────┐
│  - Decide     │           ▼
└───────────────┘   ┌──────────────────┐
                    │ Reject email      │  → Archive
                    │  (talk-to-text +  │
                    │   AI polish)      │
                    └──────────────────┘
```

Key rules from your direction:
- A submitted PRF **automatically creates a client card** (no manual data entry). The card pulls from the PRF.
- **Pipeline has no $ values** — they mean nothing until first order. Replace dollar KPI with stage-count chips.
- **Accept advances to "Send Documents"**, not "Quote". You need the PSS back before you can quote.
- **Reject** archives the client + sends an AI-drafted email composed via talk-to-text by the salesperson.
- Inbox items only leave the inbox when a decision is made. Opening the PRF without deciding keeps it in the queue.
- Contact data (name, email, phone) is never deleted — archived clients keep their record, just hidden from active views.

## Changes

### 1. Auto-create client card on PRF submission

Add a database trigger on `prf_submissions` (after insert):
- If `email` is set and no `profiles` row exists for that email with role `Client`, create one.
- Copy: `company_name → business_name`, `founder_name → full_name`, `email`, `phone`.
- Set `sales_stage = 'Lead In'`.
- Link the PRF to the new profile via `prf_submissions.owner_user_id` (already exists; trigger fills it when the email matches a future signup, but we also fill it at insert time when we create the profile).

This means: every PRF that lands shows up as a card in the **Lead In** column automatically, with its NDA/PSS/PRF dots reflecting reality.

### 2. Documents Inbox — true triage queue

**What appears:**
- Only PRFs with `status = 'new'` or `status = 'reviewing'`. Once accepted or rejected, they leave.

**Per row:**
- Company · contact · received-at · "Open PRF" button (opens the PRF detail in a side panel — read-only, with download).
- Two decision buttons: **Accept** · **Reject**.
- A salesperson can open the PRF, close it, come back later — status stays `new`/`reviewing` until they click Accept or Reject.

**Accept flow:**
- Set PRF `status = 'accepted'`.
- Move the linked client to **Send Documents** stage.
- Log to `client_activity` (`prf_accepted`).
- Toast: "Accepted — moved to Send Documents". Row disappears from inbox.

**Reject flow → talk-to-text + AI email composer:**
- Open a small dialog with:
  - Mic button (Web Speech API → live transcript) for the salesperson to dictate the gist of why.
  - Text area showing the transcript (editable).
  - **"Polish with AI"** button → calls a new edge function that uses Lovable AI Gateway (`google/gemini-2.5-flash`) to turn the dictated note into a short, professional, kind rejection email.
  - Preview of the rendered email.
  - **Send & Archive** button.
- On send: edge function sends the email via existing transactional email infra (we already have `notify.adventurebakery.info` via Resend), sets PRF `status = 'rejected'`, sets profile `sales_stage = 'Archived'`, logs to `client_activity` (`prf_rejected_emailed`).
- Row disappears from inbox; client moves to Archive view (not deleted).

**Empty state:** "Inbox zero. Nothing to review."

### 3. Pipeline — drop the dollar sign, fix the KPIs

KPIs that actually mean something at this stage of a relationship:
- **Open deals** (count of non-archived clients)
- **Stuck >7d** (no stage change in a week)
- **Awaiting docs** (in Send Documents stage)
- **PRFs to review** (inbox count)

No `MoneyOnly` `$—` tile. No "pipeline value". We can revisit dollar metrics after first orders exist (then it's real revenue, not guessed deal value).

Above the kanban: a 5-chip strip (`Lead In · Send Documents · Follow-Up · Quote · First Order`) with live counts so the eye sees "here are the 5 stages" before scanning columns.

### 4. Client Folder — micro app per client

`/team/sales/clients/:id` becomes the place a salesperson actually lives. It already exists as a route — we'll redesign the content:

- **Header**: company, contact, email, phone, current stage (with stage stepper).
- **Tabs**:
  - **Overview** — contact card, key project info pulled from latest PRF, recent activity timeline.
  - **PRFs** — list of every PRF this client has submitted (a client can have multiple projects). Each row: product name, submitted date, status, Open + Download buttons.
  - **Documents** — NDA, PSS, batch sheets — upload/view (uses existing `client_documents`).
  - **Activity** — full `client_activity` log.
  - **Notes** — free-text notes the salesperson can keep.

Out of scope for this pass: the deeper "what info to show on Overview" — that's the next conversation you flagged.

### 5. Archive view

New route `/team/sales/archive`:
- All profiles with `sales_stage = 'Archived'`.
- Shows: company, contact, email, phone, archived date, reason snippet, "Restore" action.
- Restore = move back to **Lead In**.
- Cleanup cadence is manual for now (no auto-purge); we can add a "delete forever" button later.

### 6. Sidebar tweaks (TeamLayout)

- Add **Archive** under Sales.
- Add a small badge on **Documents Inbox** with count of `status='new'/'reviewing'` PRFs.
- Add a small badge on Pipeline showing total open deals (optional — say the word).

## Files touched

- `src/pages/sales/SalesPipeline.tsx` — drop $ KPI, add stage-chip strip, update KPIs
- `src/pages/sales/SalesDocumentsInbox.tsx` — filter to undecided PRFs, Open/Accept/Reject actions
- `src/pages/sales/SalesClientFolder.tsx` — tabbed micro-app layout
- `src/pages/sales/SalesArchive.tsx` — **new** archive view
- `src/components/sales/PrfReviewPanel.tsx` — **new** side panel: read PRF, download, decide
- `src/components/sales/RejectEmailDialog.tsx` — **new** talk-to-text + AI polish + send
- `src/components/TeamLayout.tsx` — add Archive nav item, inbox count badge
- `src/components/sales/PipelineCard.tsx` — minor: remove `$—` chip
- `supabase/functions/draft-rejection-email/index.ts` — **new** edge function (Lovable AI Gateway → polish dictated note)
- `supabase/functions/send-rejection-email/index.ts` — **new** edge function (renders + sends via existing transactional infra)
- `src/App.tsx` — register `/team/sales/archive` route

## Database changes

One migration:
1. **Trigger `prf_create_client_profile`** on `prf_submissions` after insert: upsert a `profiles` row with role `Client` for the submitter's email, copy contact fields, set `sales_stage='Lead In'`, link `owner_user_id` if a profile already exists for that email.
2. **Add `'reviewing'`, `'accepted'`, `'rejected'`** as accepted values in `prf_submissions.status` (it's already free text — no constraint change needed; just documenting).
3. **Add `'Archived'`** as a valid `sales_stage` value (also free text — no constraint).
4. **Index** on `prf_submissions(status, created_at)` for inbox query speed.

No schema-breaking changes. Existing PRFs stay where they are; the trigger only fires for new inserts. We'll backfill the 6 existing `status='new'` PRFs as a one-time data step (insert tool, not migration).

## Out of scope (for the next pass)

- The exact information architecture of the Client Folder Overview tab — you flagged this as its own conversation.
- Auto-purge schedule for archived clients.
- Dollar-based metrics — revisit once first orders flow through.
- Voice transcription accuracy guarantees — using browser Web Speech API; works in Chrome/Edge, falls back to plain typing in Safari.
