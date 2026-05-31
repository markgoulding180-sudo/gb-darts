import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Game } from '../lib/types';
import Link from 'next/link';

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [gameSettings, setGameSettings] = useState({
    startScore: 501,
    legs: 3,
    usePin: false,
    pin: '',
  });
  const [showPinModal, setShowPinModal] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [enteredPin, setEnteredPin] = useState('');

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

    // Mark user offline when they leave the page using Beacon API
    const handleBeforeUnload = () => {
      if (currentUser) {
        // Use sendBeacon for reliable delivery on page close
        const data = JSON.stringify({ userId: currentUser.id });
        navigator.sendBeacon('/api/offline', data);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Also mark offline when tab becomes hidden (user switches tabs)
    const handleVisibilityChange = () => {
      if (document.hidden && currentUser) {
        supabase.from('users').update({ is_online: false, is_ready: false }).eq('id', currentUser.id);
      } else if (!document.hidden && currentUser) {
        // User came back - mark online
        supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', currentUser.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Heartbeat - update last_seen every 30 seconds
    const heartbeat = setInterval(() => {
      if (currentUser) {
        supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', currentUser.id);
      }
    }, 30000);



    return () => {
      usersChannel.unsubscribe();
      gamesChannel.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(heartbeat);

    };
  }, [currentUser]);

  async function fetchCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Mark user as online with last_seen when they load the page
      await supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user.id);
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) setCurrentUser(data);
    }
  }

  async function fetchUsers() {
    // Show all users marked as online (they mark themselves offline when leaving)
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
      .eq('status', 'waiting')
      .order('created_at', { ascending: false });
    if (data) setGames(data);
  }

  async function toggleReady() {
    if (!currentUser) return;
    
    if (currentUser.is_ready) {
      // Cancel ready - delete their waiting game
      await supabase.from('games').delete().eq('player1_id', currentUser.id).eq('status', 'waiting');
      await supabase.from('users').update({ is_ready: false }).eq('id', currentUser.id);
      setCurrentUser({ ...currentUser, is_ready: false });
    } else {
      // Show modal to set game options
      setShowReadyModal(true);
    }
  }

  async function createGame() {
    if (!currentUser) return;
    
    // Validate PIN if enabled
    if (gameSettings.usePin && gameSettings.pin.length !== 4) {
      alert('Please enter a 4-digit PIN');
      return;
    }
    
    // Create game in waiting status
    const { data: game } = await supabase
      .from('games')
      .insert({
        player1_id: currentUser.id,
        player2_id: null,
        player1_name: currentUser.username,
        player2_name: null,
        start_score: gameSettings.startScore,
        legs_to_win: Math.ceil(gameSettings.legs / 2),
        current_leg: 1,
        player1_legs: 0,
        player2_legs: 0,
        player1_score: gameSettings.startScore,
        player2_score: gameSettings.startScore,
        current_player: currentUser.id,
        status: 'waiting',
        pin: gameSettings.usePin ? gameSettings.pin : null,
      })
      .select()
      .single();

    if (game) {
      await supabase.from('users').update({ is_ready: true }).eq('id', currentUser.id);
      setCurrentUser({ ...currentUser, is_ready: true });
      setShowReadyModal(false);
      // Reset PIN
      setGameSettings({ ...gameSettings, pin: '', usePin: false });
    }
  }

  function handleJoinClick(game: Game) {
    if (game.pin) {
      // Game has PIN, show PIN modal
      setSelectedGame(game);
      setShowPinModal(true);
    } else {
      // No PIN, join directly
      joinGame(game);
    }
  }

  async function verifyPinAndJoin() {
    if (!selectedGame || !currentUser) return;
    
    if (enteredPin !== selectedGame.pin) {
      alert('Incorrect PIN');
      return;
    }
    
    await joinGame(selectedGame);
    setShowPinModal(false);
    setEnteredPin('');
    setSelectedGame(null);
  }

  async function joinGame(game: Game) {
    if (!currentUser) return;
    
    // Join the game
    const { data: updatedGame } = await supabase
      .from('games')
      .update({
        player2_id: currentUser.id,
        player2_name: currentUser.username,
        status: 'playing',
      })
      .eq('id', game.id)
      .select()
      .single();

    if (updatedGame) {
      // Mark both players as not ready
      await supabase.from('users').update({ is_ready: false }).eq('id', game.player1_id);
      await supabase.from('users').update({ is_ready: false }).eq('id', currentUser.id);
      
      // Go to game
      window.location.href = `/game/${game.id}`;
    }
  }

  // Find game created by a user
  function getUserGame(userId: string): Game | undefined {
    return games.find(g => g.player1_id === userId && g.status === 'waiting');
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
                {currentUser.is_ready ? 'Cancel Ready' : 'Ready Up'}
              </button>
              <Link href="/stats">
                <button className="btn">Stats</button>
              </Link>
              <Link href="/settings">
                <button className="btn">Settings</button>
              </Link>
              <button 
                className="btn" 
                onClick={async () => {
                  await supabase.from('users').update({ is_online: false, is_ready: false }).eq('id', currentUser.id);
                  setCurrentUser({ ...currentUser, is_online: false, is_ready: false });
                }}
                style={{ fontSize: '0.8rem' }}
              >
                Go Offline
              </button>
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
        {/* Waiting Games - New Section */}
        <div className="card">
          <h2 className="card-title">Waiting for Opponent</h2>
          <div className="user-list">
            {games.filter(g => g.status === 'waiting' && g.player1_id !== currentUser?.id).map(game => (
              <div
                key={game.id}
                className="user-item ready"
                style={{ borderColor: '#00d4ff' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="user-name">{game.player1_name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#8b9dc3' }}>
                    {game.start_score} · Best of {game.legs_to_win * 2 - 1}
                    {game.pin && ' 🔒'}
                  </span>
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleJoinClick(game)}
                  style={{ padding: '6px 15px', fontSize: '0.85rem' }}
                >
                  Join Game
                </button>
              </div>
            ))}
            {games.filter(g => g.status === 'waiting' && g.player1_id !== currentUser?.id).length === 0 && (
              <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '20px' }}>
                No games waiting
              </p>
            )}
          </div>
        </div>

        {/* Online Users - Now just shows who's online */}
        <div className="card">
          <h2 className="card-title">Online Players</h2>
          <div className="user-list">
            {users.filter(u => u.id !== currentUser?.id && !getUserGame(u.id)).map(user => (
              <div
                key={user.id}
                className="user-item"
              >
                <span className="user-name">{user.username}</span>
                <span className="status-dot online" />
              </div>
            ))}
            {users.filter(u => u.id !== currentUser?.id && !getUserGame(u.id)).length === 0 && (
              <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '20px' }}>
                No other players online
              </p>
            )}
          </div>
        </div>

        {/* Live Games */}
        <div className="card">
          <h2 className="card-title">Live Games</h2>
          <div className="game-list">
            {games.filter(g => g.status === 'playing').map(game => (
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
            {games.filter(g => g.status === 'playing').length === 0 && (
              <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '40px' }}>
                No active games
              </p>
            )}
          </div>
        </div>

        {/* How to Play */}
        <div className="card">
          <h2 className="card-title">How to Play</h2>
          <div style={{ color: '#8b9dc3', lineHeight: 1.8 }}>
            <p style={{ marginBottom: '15px' }}>
              1. Login or register an account
            </p>
            <p style={{ marginBottom: '15px' }}>
              2. Click <strong style={{ color: '#00ff88' }}>Ready Up</strong> and set game options
            </p>
            <p style={{ marginBottom: '15px' }}>
              3. Other players see you as ready with <strong>Join Game</strong> button
            </p>
            <p style={{ marginBottom: '15px' }}>
              4. They click Join to start the game
            </p>
            <p>
              5. Play with webcam and track scores!
            </p>
          </div>
        </div>
      </div>

      {/* Ready Up Modal */}
      {showReadyModal && (
        <div className="modal-overlay" onClick={() => setShowReadyModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Set Up Game</h2>
            <p style={{ textAlign: 'center', marginBottom: '20px', color: '#8b9dc3' }}>
              Choose your game settings
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

            {/* PIN Option */}
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="usePin"
                checked={gameSettings.usePin}
                onChange={e => setGameSettings({ ...gameSettings, usePin: e.target.checked })}
              />
              <label htmlFor="usePin" style={{ margin: 0, cursor: 'pointer' }}>Lock game with PIN</label>
            </div>

            {gameSettings.usePin && (
              <div className="form-group">
                <label className="form-label">4-Digit PIN</label>
                <input
                  type="password"
                  className="form-input"
                  value={gameSettings.pin}
                  onChange={e => setGameSettings({ ...gameSettings, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="0000"
                  maxLength={4}
                  style={{ textAlign: 'center', letterSpacing: '5px', fontSize: '1.2rem' }}
                />
              </div>
            )}

            <div className="modal-buttons">
              <button className="btn" onClick={() => setShowReadyModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={createGame}>
                Create Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Entry Modal */}
      {showPinModal && selectedGame && (
        <div className="modal-overlay" onClick={() => setShowPinModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Enter PIN</h2>
            <p style={{ textAlign: 'center', marginBottom: '20px', color: '#8b9dc3' }}>
              {selectedGame.player1_name}'s game is locked
            </p>
            
            <div className="form-group">
              <label className="form-label">4-Digit PIN</label>
              <input
                type="password"
                className="form-input"
                value={enteredPin}
                onChange={e => setEnteredPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                maxLength={4}
                style={{ textAlign: 'center', letterSpacing: '5px', fontSize: '1.5rem' }}
                autoFocus
              />
            </div>

            <div className="modal-buttons">
              <button className="btn" onClick={() => setShowPinModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={verifyPinAndJoin}>
                Join Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
