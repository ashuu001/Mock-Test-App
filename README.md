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


## Automatic answer-key marking

After finishing a test, the app opens **Automatic Marking**. Use **Upload Answer Key** to upload an official key as a PDF or image (JPG/PNG/WEBP). Text-based PDFs are read directly; scanned PDFs and images are processed with OCR.

For best recognition, format the key with clear entries such as:
`1-A, 2-C, 3-B, 4-D`
or
`Q1: A`
`Q2: C`

The app compares each detected key answer against the saved response, classifies questions as correct/wrong/unattempted, and calculates the existing 100-mark score with 1/3 negative marking. You can manually edit any classification after automatic marking.
