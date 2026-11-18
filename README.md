# Tangent

Lecture notes that stay on the slide you're actually hearing.

Upload a PDF deck (or load the sample calculus lecture). Tangent listens to the lecture, keeps a live transcript, and moves the slide viewer with the talk. Notes are timestamped per slide, with highlights and exam flags. Everything stays in the browser.

## What it does

- Classes with a flag color, rename, and delete
- PDF slide upload, text extraction, and page rendering
- Live transcript via the browser speech API, plus a rehearsal simulation
- Automatic slide tracking (local match, optional Grok assist)
- Per-slide notes, inline edit, undo, highlight, and exam marks
- Match log and rehearsal truth marks
- JSON export

## Stack

TanStack Start, React 19, TypeScript, Tailwind CSS, Zustand, pdfjs-dist.

## Develop

```sh
npm install
npm run dev
```

The app serves at [http://localhost:8080](http://localhost:8080).

Slide tracking works offline. Grok assist needs `XAI_API_KEY` in the environment; without it, matching stays local.
