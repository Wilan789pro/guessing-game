# Agent Prism Mission

A cinematic, mobile-first classified date invitation and guessing game built around a persistent mission flow, local-first UX, and Supabase-ready schema.

## Run locally

1. Copy `.env.example` to `.env` and fill in the Supabase values if available.
2. Install dependencies:

   npm install

3. Start the app:

   npm start

4. Open the site at http://localhost:3000

## Admin Command Center

Open http://localhost:3000/admin and use the access code:

- `lama-ops`

This is a development-safe admin route for monitoring the mission state.

## GitHub Pages

The repository deploys the static site to `https://wilan789pro.github.io/guessing-game/` through `.github/workflows/pages.yml` whenever `main` is updated.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Add these repository variables under **Settings → Secrets and variables → Actions → Variables**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PUBLIC_APP_NAME` (optional; defaults to `Agent Prism Mission`)

`SUPABASE_ANON_KEY` is a public client key, not a service-role key. Never add a service-role key to repository variables or the browser app. If the Supabase variables are omitted, the static site still builds and uses local browser storage, but remote database sync is unavailable.

To check the static artifact locally, run `npm run build:pages` and serve the generated `dist` directory with any static HTTP server. The build preserves relative URLs so the project site works below `/guessing-game/`.

## Supabase

The project includes a SQL migration in `supabase/001_create_mission_schema.sql`.

If Supabase credentials are configured, the application can be connected to the remote database while preserving localStorage-backed fallback behavior.

## Mission rules

- Secret destination: HARRY POTTER ESCAPE ROOM
- The public site does not reveal it before the game is solved.
- There are 10 hint packets costing one kiss each.
- Hangman uses the answer as the exact phrase.
- Direct answer bypass costs 100 kisses.
- Every important interaction is stored in the mission event trail.
