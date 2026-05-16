## Fix the View button for uploaded templates

Two real issues behind what you saw:

1. **PDF NDA opened a blank tab.** The file was uploaded with whatever `file.type` the browser reported (often empty on drag-drop or `application/octet-stream`). The signed URL then serves it without `Content-Type: application/pdf`, so Chrome shows a blank tab instead of the PDF viewer. `createSignedUrl` does not let us override response headers, so re-pointing at the same URL won't help.

2. **PSS "View" downloaded instead of opening.** That's an `.xlsx` file — browsers have no inline viewer for Excel, so any link to it will download. "View" for a workbook is not a thing the browser can do.

### Fix in `src/pages/team/Templates.tsx`

- **Rewrite `view()` to go through a blob with a corrected MIME type**, derived from the file extension (not the stored content-type):
  - `.pdf` → `application/pdf` → opens inline in a new tab.
  - `.xlsx` / `.xls` → no inline viewer exists; show a toast ("Excel files can't be previewed in the browser — use Download") and fall back to triggering a download. Optionally hide the View button entirely for workbook rows so the UI doesn't promise something it can't deliver.
  - Anything else → open the blob URL in a new tab and let the browser decide.
- Use `window.open(blobUrl, "_blank")` after constructing `new Blob([bytes], { type: correctedType })`, and revoke the URL on a short timeout.
- Keep `download()` exactly as it is (you confirmed downloads work).

- **Fix `handleUpload()` so future uploads store the right content-type**: if `file.type` is empty or `application/octet-stream`, infer it from the extension (`.pdf` → `application/pdf`, `.xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). This means *newly* uploaded PDFs would also render correctly if you ever switched back to a direct signed-URL open.

### UI tweak (small)

For `pss_workbook` rows, render only the **Download** button (no "View"), since there is no in-browser preview for Excel. For `nda` (PDF) rows, keep **View** + **Download**.

### Files touched
- `src/pages/team/Templates.tsx` — new `view()` implementation, extension-based MIME inference on upload, conditional View button per kind.

### Out of scope
- Converting the uploaded `.xlsx` to a PDF preview server-side (possible later via an edge function if you want true in-app preview of the workbook).
- Re-uploading the existing NDA — not required; the new `view()` path forces the correct MIME from the blob, so the current file will render.
