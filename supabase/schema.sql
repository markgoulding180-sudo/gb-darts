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
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
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
  pin TEXT, -- Optional 4-digit PIN for private games
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
CREATE POLICY "Games deletable by players" ON games FOR DELETE USING (
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

-- Game History table (archived games with JSON data)
CREATE TABLE IF NOT EXISTS game_history (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  player1_name TEXT,
  player2_name TEXT,
  start_score INTEGER,
  legs_to_win INTEGER,
  player1_legs INTEGER,
  player2_legs INTEGER,
  winner_id UUID REFERENCES users(id),
  winner_name TEXT,
  throws JSONB, -- Array of all throws with scores, darts, etc.
  player1_stats JSONB, -- Avg, 180s, etc.
  player2_stats JSONB,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for game_history
alter table game_history enable row level security;
CREATE POLICY "Game history readable by players" ON game_history FOR SELECT USING (
  auth.uid() = player1_id OR auth.uid() = player2_id
);

-- Function to archive a finished game
CREATE OR REPLACE FUNCTION archive_finished_game(game_id UUID)
RETURNS VOID AS $$
DECLARE
  game_record games%ROWTYPE;
  throws_json JSONB;
  p1_stats JSONB;
  p2_stats JSONB;
BEGIN
  -- Get game data
  SELECT * INTO game_record FROM games WHERE id = game_id;
  
  -- Get all throws as JSON
  SELECT jsonb_agg(
    jsonb_build_object(
      'score', score,
      'darts', darts,
      'remaining', remaining,
      'is_bust', is_bust,
      'player_id', player_id,
      'created_at', created_at
    ) ORDER BY created_at
  ) INTO throws_json
  FROM throws WHERE throws.game_id = game_id;
  
  -- Calculate stats for player 1
  SELECT jsonb_build_object(
    'avg', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND((SUM(score)::numeric / (COUNT(*) * 3)) * 3, 1) ELSE 0 END FROM throws WHERE game_id = game_id AND player_id = game_record.player1_id AND NOT is_bust),
    'darts_thrown', (SELECT COUNT(*) * 3 FROM throws WHERE game_id = game_id AND player_id = game_record.player1_id),
    'count80', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player1_id AND score >= 80 AND score < 100),
    'count100', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player1_id AND score >= 100 AND score < 140),
    'count140', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player1_id AND score >= 140 AND score < 180),
    'count180', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player1_id AND score = 180)
  ) INTO p1_stats;
  
  -- Calculate stats for player 2
  SELECT jsonb_build_object(
    'avg', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND((SUM(score)::numeric / (COUNT(*) * 3)) * 3, 1) ELSE 0 END FROM throws WHERE game_id = game_id AND player_id = game_record.player2_id AND NOT is_bust),
    'darts_thrown', (SELECT COUNT(*) * 3 FROM throws WHERE game_id = game_id AND player_id = game_record.player2_id),
    'count80', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player2_id AND score >= 80 AND score < 100),
    'count100', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player2_id AND score >= 100 AND score < 140),
    'count140', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player2_id AND score >= 140 AND score < 180),
    'count180', (SELECT COUNT(*) FROM throws WHERE game_id = game_id AND player_id = game_record.player2_id AND score = 180)
  ) INTO p2_stats;
  
  -- Insert into history
  INSERT INTO game_history (
    id, player1_id, player2_id, player1_name, player2_name,
    start_score, legs_to_win, player1_legs, player2_legs,
    winner_id, winner_name, throws, player1_stats, player2_stats, played_at
  ) VALUES (
    game_record.id, game_record.player1_id, game_record.player2_id,
    game_record.player1_name, game_record.player2_name,
    game_record.start_score, game_record.legs_to_win,
    game_record.player1_legs, game_record.player2_legs,
    game_record.winner,
    CASE WHEN game_record.winner = game_record.player1_id THEN game_record.player1_name ELSE game_record.player2_name END,
    throws_json, p1_stats, p2_stats, game_record.created_at
  );
  
  -- Delete throws (game stays in games table for the list)
  DELETE FROM throws WHERE throws.game_id = game_id;
END;
$$ LANGUAGE plpgsql;

-- Enable realtime
alter publication supabase_realtime add table users;
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table throws;
alter publication supabase_realtime add table game_history;
