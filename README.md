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
