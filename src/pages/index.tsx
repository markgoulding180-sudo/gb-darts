import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Game } from '../lib/types';
import Link from 'next/link';

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [gameSettings, setGameSettings] = useState({
    startScore: 501,
    legs: 3,
  });

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
    fetchGames();
    
    // Subscribe to realtime changes
    const usersChannel = supabase
      .channel('users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchUsers)
      .subscribe();

    const gamesChannel = supabase
      .channel('games')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, fetchGames)
      .subscribe();

    return () => {
      usersChannel.unsubscribe();
      gamesChannel.unsubscribe();
    };
  }, []);

  async function fetchCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) setCurrentUser(data);
    }
  }

  async function fetchUsers() {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('is_online', true)
      .order('username');
    if (data) setUsers(data);
  }

  async function fetchGames() {
    const { data } = await supabase
      .from('games')
      .select('*')
      .in('status', ['waiting', 'playing'])
      .order('created_at', { ascending: false });
    if (data) setGames(data);
  }

  async function toggleReady() {
    if (!currentUser) return;
    await supabase
      .from('users')
      .update({ is_ready: !currentUser.is_ready })
      .eq('id', currentUser.id);
    setCurrentUser({ ...currentUser, is_ready: !currentUser.is_ready });
  }

  function challengePlayer(opponent: User) {
    setSelectedOpponent(opponent);
    setShowSetupModal(true);
  }

  async function startGame() {
    if (!currentUser || !selectedOpponent) return;
    
    const { data: game } = await supabase
      .from('games')
      .insert({
        player1_id: currentUser.id,
        player2_id: selectedOpponent.id,
        player1_name: currentUser.username,
        player2_name: selectedOpponent.username,
        start_score: gameSettings.startScore,
        legs_to_win: Math.ceil(gameSettings.legs / 2),
        current_leg: 1,
        player1_legs: 0,
        player2_legs: 0,
        player1_score: gameSettings.startScore,
        player2_score: gameSettings.startScore,
        current_player: currentUser.id,
        status: 'playing',
      })
      .select()
      .single();

    if (game) {
      window.location.href = `/game/${game.id}`;
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1 className="logo">GB Darts</h1>
        <div className="nav-buttons">
          {currentUser ? (
            <>
              <button
                className={`btn btn-ready ${currentUser.is_ready ? 'active' : ''}`}
                onClick={toggleReady}
              >
                {currentUser.is_ready ? 'Ready ✓' : 'Ready Up'}
              </button>
              <Link href="/settings">
                <button className="btn">Settings</button>
              </Link>
              <span style={{ color: '#00d4ff', alignSelf: 'center' }}>
                {currentUser.username}
              </span>
            </>
          ) : (
            <>
              <Link href="/login">
                <button className="btn">Login</button>
              </Link>
              <Link href="/register">
                <button className="btn btn-primary">Register</button>
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="dashboard">
        {/* Online Users */}
        <div className="card">
          <h2 className="card-title">Online Players</h2>
          <div className="user-list">
            {users.filter(u => u.id !== currentUser?.id).map(user => (
              <div
                key={user.id}
                className={`user-item ${user.is_ready ? 'ready' : ''}`}
                onClick={() => challengePlayer(user)}
              >
                <span className="user-name">{user.username}</span>
                <span className={`status-dot ${user.is_ready ? 'online' : ''}`} />
              </div>
            ))}
            {users.filter(u => u.id !== currentUser?.id).length === 0 && (
              <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '20px' }}>
                No players online
              </p>
            )}
          </div>
        </div>

        {/* Live Games */}
        <div className="card">
          <h2 className="card-title">Live Games</h2>
          <div className="game-list">
            {games.map(game => (
              <Link key={game.id} href={`/game/${game.id}`} style={{ textDecoration: 'none' }}>
                <div className="game-item">
                  <div className="game-players">
                    <span>{game.player1_name}</span>
                    <span className="game-vs">VS</span>
                    <span>{game.player2_name}</span>
                  </div>
                  <div className="game-score">
                    <div className="game-legs">
                      Legs: {game.player1_legs} - {game.player2_legs}
                    </div>
                    <div className="game-current">
                      {game.player1_score} - {game.player2_score}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {games.length === 0 && (
              <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '40px' }}>
                No active games
              </p>
            )}
          </div>
        </div>

        {/* Stats / Info */}
        <div className="card">
          <h2 className="card-title">How to Play</h2>
          <div style={{ color: '#8b9dc3', lineHeight: 1.8 }}>
            <p style={{ marginBottom: '15px' }}>
              1. Login or register an account
            </p>
            <p style={{ marginBottom: '15px' }}>
              2. Click <strong style={{ color: '#00ff88' }}>Ready Up</strong> to go green
            </p>
            <p style={{ marginBottom: '15px' }}>
              3. Click on a ready player to challenge them
            </p>
            <p style={{ marginBottom: '15px' }}>
              4. Set your game options (501/301, legs)
            </p>
            <p>
              5. Play with webcam and track scores!
            </p>
          </div>
        </div>
      </div>

      {/* Game Setup Modal */}
      {showSetupModal && (
        <div className="modal-overlay" onClick={() => setShowSetupModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Game Setup</h2>
            <p style={{ textAlign: 'center', marginBottom: '20px', color: '#8b9dc3' }}>
              Challenge: <strong style={{ color: '#00d4ff' }}>{selectedOpponent?.username}</strong>
            </p>
            
            <div className="form-group">
              <label className="form-label">Starting Score</label>
              <select
                className="form-select"
                value={gameSettings.startScore}
                onChange={e => setGameSettings({ ...gameSettings, startScore: Number(e.target.value) })}
              >
                <option value={501}>501</option>
                <option value={301}>301</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Total Legs</label>
              <select
                className="form-select"
                value={gameSettings.legs}
                onChange={e => setGameSettings({ ...gameSettings, legs: Number(e.target.value) })}
              >
                <option value={1}>1 Leg</option>
                <option value={3}>Best of 3</option>
                <option value={5}>Best of 5</option>
                <option value={7}>Best of 7</option>
              </select>
            </div>

            <div className="modal-buttons">
              <button className="btn" onClick={() => setShowSetupModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={startGame}>
                Start Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
