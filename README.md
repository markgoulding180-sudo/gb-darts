# GB Darts

Real-time multiplayer darts scoring app with webcam support. Play 501 darts against opponents online with live video and score tracking.

## Features

- 🎯 Real-time 501 darts scoring
- 📹 Webcam support for both players
- 👥 Online player list with ready status
- 🏆 Live game tracking
- ⚡ Supabase realtime updates
- 🎨 Dark blue neon theme

## Tech Stack

- Next.js 14
- TypeScript
- Supabase (Auth + Database + Realtime)
- Vercel (Hosting)

## Setup

1. Clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a Supabase project at https://supabase.com

4. Run the schema in `supabase/schema.sql` in the SQL editor

5. Copy `.env.local.example` to `.env.local` and add your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

6. Run locally:
   ```bash
   npm run dev
   ```

7. Deploy to Vercel:
   ```bash
   vercel
   ```

## How to Play

1. Register/login
2. Click "Ready Up" to go green
3. Click on a ready player to challenge them
4. Set game options (501/301, best of X legs)
5. Play with webcam and track scores!

## Game Rules

- Standard 501 or 301 darts
- Must finish on exactly zero (double not required for simplicity)
- Bust if score goes below zero or hits 1
- First to win required legs wins the match
