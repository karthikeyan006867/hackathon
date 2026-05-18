# SafeSphere AI

SafeSphere AI is an intelligent industrial safety and workspace auditor that uses Gemini multimodal analysis to inspect uploaded images/videos or webcam snapshots and return strict, schema-constrained JSON for a real-time compliance dashboard.

## Why This Stands Out

- Gemini multimodal inspection for workspace visuals (image + video).
- Strict JSON response schema for robust UI binding and zero regex parsing.
- Advanced demo-ready UI: safety score ring, severity chart, hazard filters, checklist actions, history timeline, webcam capture.
- Mock mode fallback for smooth live demos even when API keys are unavailable.

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS
- Gemini API via `@google/genai`
- Recharts + Framer Motion + Lucide icons

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Add env file:

```bash
cp .env.example .env.local
```

3. Set your Gemini key in `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

4. Start server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Gemini Implementation Notes

- API route: `src/app/api/audit/route.ts`
- Model: `gemini-2.5-flash`
- Uses `responseMimeType: application/json`
- Uses strict `responseSchema` to force structured output.

## Deploy to Vercel

1. Push repository to GitHub.
2. Import project in Vercel.
3. Add environment variable `GEMINI_API_KEY` in Vercel project settings.
4. Deploy.

## Demo Flow Suggestion

1. Show blank dashboard.
2. Upload unsafe workspace image.
3. Highlight low score, high-severity hazards, and generated action plan.
4. Upload safer workspace image and show improved score.
5. Compare audit timeline deltas.
