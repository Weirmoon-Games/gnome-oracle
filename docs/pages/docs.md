# Page: Docs (`/docs`)

The in-app documentation browser — this very page set, served from the running
app for review. **Open to everyone.**

## How it works

- `app/docs/page.tsx` lists every Markdown file under `docs/`, grouped into
  Overview / Features / Pages, via `lib/docs.listDocs()`.
- `app/docs/[...slug]/page.tsx` renders one file with the lean
  `lib/markdown.renderMarkdown()` (no heavy dependency; all input HTML-escaped).
- `GET /api/docs` and `GET /api/docs/[...slug]` expose the same data as JSON.

## Safety

`lib/docs.readDoc()` restricts reads to the `docs/` tree, `.md` only, and rejects
path traversal.
