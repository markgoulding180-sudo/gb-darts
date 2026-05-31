export interface User {
  id: string;
  username: string;
  email: string;
  is_online: boolean;
  is_ready: boolean;
  created_at: string;
}

export interface Game {
  id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
  start_score: number;
  legs_to_win: number;
  current_leg: number;
  player1_legs: number;
  player2_legs: number;
  player1_score: number;
  player2_score: number;
  current_player: string;
  status: 'waiting' | 'playing' | 'finished';
  created_at: string;
}

export interface Throw {
  id: string;
  game_id: string;
  player_id: string;
  score: number;
  darts: number;
  remaining: number;
  is_bust: boolean;
  created_at: string;
}
