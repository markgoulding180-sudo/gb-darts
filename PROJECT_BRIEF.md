# GB Darts - Project Brief

## Current Status
Last updated: 2026-05-31

## What We Have Built

### Core Features
- **User System**: Login/Register with Supabase auth
- **Online Players List**: Shows ready players (green), click to challenge
- **Game Setup**: Choose 501/301, best of X legs
- **Real-time Game**: Both players see scores update instantly
- **Webcam Support**: Both players can see themselves, swaps based on turn
- **Score Tracking**: Enter scores (0-180), validates valid dart scores
- **Checkout System**: Popup asks darts used (1-3) when hitting exact score
- **Edit Throws**: Can edit last 2 throws with Save button
- **180 Sound**: Plays Russ Bray "180!" sound when someone hits 180
- **Game End**: Shows winner, Exit Game button
- **Cancel Game**: Delete unfinished games
- **Archive System**: Finished games auto-archive to game_history table
- **Stats Page**: View all completed matches with full stats

### Tech Stack
- Next.js 14 + TypeScript
- Supabase (Auth, Database, Realtime)
- Vercel hosting

### Database Tables
- `users`: Player profiles, online status
- `games`: Active and finished games
- `throws`: Individual throws (deleted after archive)
- `game_history`: Archived games with JSON stats

---

## Known Issues / TODO

### Critical - Needs Fixing
1. **Both players can't enter score** - Game state issue where input doesn't work for both players
   - Priority: HIGH
   - Status: Needs debugging

### Medium Priority
2. **Webcam swapping** - Currently shows local webcam big when it's your turn, but opponent can't see you
   - Need WebRTC for peer-to-peer video
   - Or keep both webcams visible always

3. **Stats not updating immediately after edit** - Stats display uses cached data
   - Need to force refresh after edit

### Low Priority / Nice to Have
4. **Highest finish tracking** - Track best checkout (100+, 120+, etc.)
5. **Best/Worst leg tracking** - Darts taken to finish each leg
6. **Leaderboard** - Global rankings
7. **Friend system** - Add friends, challenge directly
8. **Chat** - In-game messaging
9. **Spectator mode** - Watch games without playing
10. **Tournaments** - Bracket system

---

## Files Structure
```
src/
  pages/
    index.tsx       - Homepage, online players, live games
    login.tsx       - Login page
    register.tsx    - Register page
    settings.tsx    - Username, webcam settings
    stats.tsx       - Match history
    game/[id].tsx   - Game page (main gameplay)
  lib/
    supabase.ts     - Supabase client
    types.ts        - TypeScript types
  styles/
    globals.css     - Global styles
public/
  russ-bray-180.mp3 - 180 sound effect
supabase/
  schema.sql        - Database schema
```

---

## Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Deployment
- GitHub: https://github.com/markgoulding180-sudo/gb-darts
- Vercel: Auto-deploys on push to master

---

## Next Steps
1. Fix the score entry bug (both players can't enter)
2. Test complete game flow end-to-end
3. Add peer-to-peer webcam (WebRTC)
4. Polish UI/UX
5. Beta testing with real players
