# Agent Dashboard MVP

This repository contains a lightweight Next.js MVP for an agent monitoring dashboard. It renders 8 mock agent cards in a responsive grid and opens a detail modal for each card.

## Run The App

1. Install dependencies with `npm install`.
2. Start the local dev server with `npm run dev`.
3. Open `http://localhost:3000` in your browser, or use the alternate local port shown in the terminal if `3000` is already in use.
4. Create a production build with `npm run build`.

## Current MVP Scope

- Next.js App Router frontend
- Responsive dashboard with 8 mock agent cards
- Agent details modal with richer status context
- Mock data stored locally in `lib/mock-agents.ts`
- Optional mock API route at `/api/agents`

## Next Steps

- Replace mock data with a real backend or streaming agent status source
- Add filtering, search, and live refresh behavior
- Introduce authentication and role-based access once the product flow is settled
