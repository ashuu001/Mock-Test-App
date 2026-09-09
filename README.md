# OMR Mock Test

A local-first React/Vite mock-test app for a 120-question, 100-mark MCQ exam.

## Features
- Exam name entered by user
- 120 MCQ response bubbles (A/B/C/D)
- 2-hour countdown with auto-lock
- Answers can be changed
- Auto-save in browser localStorage
- Save/load portable JSON answer sheets
- Marking mode: Correct / Wrong / Unattempted
- 1/3 negative marking
- Exact internal scoring: 100/120 per correct, 100/360 deducted per wrong
- Result summary and answer review

## Run locally
Requirements: Node.js 18+ (Node 20+ recommended).

```bash
cd mock-test-app
npm install
npm run dev
```

Open the localhost URL printed by Vite, normally `http://localhost:5173`.

For a production build:

```bash
npm run build
npm run preview
```

## Important
The project source is complete, but dependencies are intentionally not bundled. Run `npm install` on your own machine; it will install React, Vite, TypeScript and Lucide React.

