-- Enable RLS
alter table users enable row level security;
alter table games enable row level security;
alter table throws enable row level security;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  is_online BOOLEAN DEFAULT false,
  is_ready BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  player1_name TEXT,
  player2_name TEXT,
  start_score INTEGER DEFAULT 501,
  legs_to_win INTEGER DEFAULT 2,
  current_leg INTEGER DEFAULT 1,
  player1_legs INTEGER DEFAULT 0,
  player2_legs INTEGER DEFAULT 0,
  player1_score INTEGER DEFAULT 501,
  player2_score INTEGER DEFAULT 501,
  current_player UUID REFERENCES users(id),
  status TEXT DEFAULT 'waiting', -- waiting, playing, finished
  winner UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Throws table
CREATE TABLE IF NOT EXISTS throws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id),
  score INTEGER NOT NULL,
  darts INTEGER DEFAULT 3,
  remaining INTEGER NOT NULL,
  is_bust BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies

-- Users: can read all users, update own record
CREATE POLICY "Users can read all users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own record" ON users FOR UPDATE USING (auth.uid() = id);

-- Games: players can read their games, all can read active games
CREATE POLICY "Games readable by players" ON games FOR SELECT USING (
  auth.uid() = player1_id OR auth.uid() = player2_id OR status IN ('waiting', 'playing')
);
CREATE POLICY "Games insertable by authenticated" ON games FOR INSERT WITH CHECK (auth.uid() = player1_id);
CREATE POLICY "Games updatable by players" ON games FOR UPDATE USING (
  auth.uid() = player1_id OR auth.uid() = player2_id
);

-- Throws: readable by game players, insertable by current player
CREATE POLICY "Throws readable by game players" ON throws FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM games WHERE games.id = throws.game_id 
    AND (games.player1_id = auth.uid() OR games.player2_id = auth.uid())
  )
);
CREATE POLICY "Throws insertable by game players" ON throws FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM games WHERE games.id = throws.game_id 
    AND (games.player1_id = auth.uid() OR games.player2_id = auth.uid())
  )
);

-- Enable realtime
alter publication supabase_realtime add table users;
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table throws;
