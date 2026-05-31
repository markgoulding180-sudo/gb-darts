-- Fixed archive function with unambiguous column references
CREATE OR REPLACE FUNCTION archive_finished_game(p_game_id UUID)
RETURNS VOID AS $$
DECLARE
  game_record games%ROWTYPE;
  throws_json JSONB;
  p1_stats JSONB;
  p2_stats JSONB;
BEGIN
  -- Get game data
  SELECT * INTO game_record FROM games WHERE id = p_game_id;
  
  -- Get all throws as JSON (use explicit table alias)
  SELECT jsonb_agg(
    jsonb_build_object(
      'score', t.score,
      'darts', t.darts,
      'remaining', t.remaining,
      'is_bust', t.is_bust,
      'player_id', t.player_id,
      'created_at', t.created_at
    ) ORDER BY t.created_at
  ) INTO throws_json
  FROM throws t WHERE t.game_id = p_game_id;
  
  -- Calculate stats for player 1 (use explicit alias)
  SELECT jsonb_build_object(
    'avg', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND((SUM(t.score)::numeric / (COUNT(*) * 3)) * 3, 2) ELSE 0 END FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player1_id AND NOT t.is_bust),
    'darts_thrown', (SELECT COUNT(*) * 3 FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player1_id),
    'count80', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player1_id AND t.score >= 80 AND t.score < 100),
    'count100', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player1_id AND t.score >= 100 AND t.score < 140),
    'count140', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player1_id AND t.score >= 140 AND t.score < 180),
    'count180', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player1_id AND t.score = 180)
  ) INTO p1_stats;
  
  -- Calculate stats for player 2 (use explicit alias)
  SELECT jsonb_build_object(
    'avg', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND((SUM(t.score)::numeric / (COUNT(*) * 3)) * 3, 2) ELSE 0 END FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player2_id AND NOT t.is_bust),
    'darts_thrown', (SELECT COUNT(*) * 3 FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player2_id),
    'count80', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player2_id AND t.score >= 80 AND t.score < 100),
    'count100', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player2_id AND t.score >= 100 AND t.score < 140),
    'count140', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player2_id AND t.score >= 140 AND t.score < 180),
    'count180', (SELECT COUNT(*) FROM throws t WHERE t.game_id = p_game_id AND t.player_id = game_record.player2_id AND t.score = 180)
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
  
  -- Delete throws
  DELETE FROM throws t WHERE t.game_id = p_game_id;
END;
$$ LANGUAGE plpgsql;
