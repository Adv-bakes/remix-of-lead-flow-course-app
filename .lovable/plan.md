## Consolidate template/upload buttons into dropdowns

### Sales Dashboard (`/team/sales/dashboard`)
Replace the current "Blank templates" strip (three separate PRF / NDA / PSS download buttons) with **one** button:

- **Download Templates ▾** — dropdown menu with three items:
  - Blank PRF
  - NDA
  - PSS workbook
- Disabled items (greyed out) when no active template exists for that kind, with a small hint ("not uploaded yet").
- Uses the existing `fetchActiveTemplate` / `downloadTemplate` helpers from `src/lib/templates.ts`.

### Sales Project Workspace (`/team/sales/projects/:id`) — client folder
Today the PRF, PSS, and NDA rows each render their own Download-template + Upload buttons when the document is missing. Replace with **two** buttons in the document section header:

- **Download Templates ▾** — same dropdown as the dashboard (PRF / NDA / PSS).
- **Upload Form ▾** — dropdown with three items:
  - Upload PRF
  - Upload PSS
  - Upload NDA
  
  Each item opens the existing file picker and runs the same upload + `client_documents` insert (`review_status: 'pending'`) logic currently wired per-row. After upload, the corresponding row shows the uploaded file as it does today.

Rows that already have a document keep their current view/replace controls — only the empty-state per-row Upload/Download buttons are removed in favor of the two header dropdowns.

### Out of scope
- AddDealDialog (single PRF upload, keeps its inline "Download blank PRF" link).
- Inbox, batch sheet button, project card pending chips — unchanged.
- No backend / schema changes.

### Files to touch
- `src/pages/sales/SalesDashboard.tsx` — replace 3-button strip with `DropdownMenu`.
- `src/pages/sales/SalesProjectWorkspace.tsx` — add two header dropdowns, remove per-row empty-state buttons.
- Reuse shadcn `DropdownMenu` (already in project) and existing `templates.ts` helpers.
