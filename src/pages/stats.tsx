import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

interface GameHistory {
  id: string;
  player1_name: string;
  player2_name: string;
  player1_legs: number;
  player2_legs: number;
  winner_name: string;
  start_score: number;
  played_at: string;
  player1_stats: any;
  player2_stats: any;
}

export default function Stats() {
  const [games, setGames] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedGame, setSelectedGame] = useState<GameHistory | null>(null);

  useEffect(() => {
    getUserAndGames();
  }, []);

  async function getUserAndGames() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    
    const { data: userData } = await supabase.from('users').select('*').eq('id', user.id).single();
    setCurrentUser(userData);
    
    // Get game history
    const { data: history } = await supabase
      .from('game_history')
      .select('*')
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .order('played_at', { ascending: false });
    
    if (history) setGames(history);
    setLoading(false);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#00d4ff' }}>Loading...</div>;

  if (!currentUser) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2 className="card-title">Please Login</h2>
          <p style={{ color: '#8b9dc3', marginBottom: '20px' }}>You need to be logged in to view your stats.</p>
          <Link href="/login">
            <button className="btn btn-primary">Login</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <h1 className="logo">GB Darts</h1>
        </Link>
        <div className="nav-buttons">
          <span style={{ color: '#00d4ff', alignSelf: 'center', marginRight: '15px' }}>
            {currentUser.username}
          </span>
          <Link href="/">
            <button className="btn">Back to Game</button>
          </Link>
        </div>
      </header>

      <h2 className="card-title" style={{ marginBottom: '20px' }}>Your Match History</h2>

      {games.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#8b9dc3' }}>No completed games yet.</p>
          <Link href="/">
            <button className="btn btn-primary" style={{ marginTop: '15px' }}>Play a Game</button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {games.map(game => (
            <div 
              key={game.id} 
              className="card"
              style={{ 
                cursor: 'pointer',
                border: selectedGame?.id === game.id ? '2px solid #00d4ff' : '1px solid rgba(0,212,255,0.3)',
              }}
              onClick={() => setSelectedGame(selectedGame?.id === game.id ? null : game)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                    {game.player1_name} vs {game.player2_name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#8b9dc3', marginTop: '5px' }}>
                    {formatDate(game.played_at)} · {game.start_score} · Match #{game.id.slice(0, 8).toUpperCase()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#00d4ff' }}>
                    {game.player1_legs} - {game.player2_legs}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#00ff88' }}>
                    Winner: {game.winner_name}
                  </div>
                </div>
              </div>

              {/* Expanded stats */}
              {selectedGame?.id === game.id && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(0,212,255,0.2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Player 1 Stats */}
                    <div style={{ padding: '15px', background: 'rgba(0,212,255,0.05)', borderRadius: '8px' }}>
                      <div style={{ fontWeight: '700', marginBottom: '10px', color: '#00d4ff' }}>{game.player1_name}</div>
                      {game.player1_stats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.9rem' }}>
                          <div>Avg: <strong>{game.player1_stats.avg}</strong></div>
                          <div>Darts: <strong>{game.player1_stats.darts_thrown}</strong></div>
                          <div>80+: <strong>{game.player1_stats.count80}</strong></div>
                          <div>100+: <strong>{game.player1_stats.count100}</strong></div>
                          <div>140+: <strong>{game.player1_stats.count140}</strong></div>
                          <div>180s: <strong>{game.player1_stats.count180}</strong></div>
                        </div>
                      )}
                    </div>

                    {/* Player 2 Stats */}
                    <div style={{ padding: '15px', background: 'rgba(0,212,255,0.05)', borderRadius: '8px' }}>
                      <div style={{ fontWeight: '700', marginBottom: '10px', color: '#00d4ff' }}>{game.player2_name}</div>
                      {game.player2_stats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.9rem' }}>
                          <div>Avg: <strong>{game.player2_stats.avg}</strong></div>
                          <div>Darts: <strong>{game.player2_stats.darts_thrown}</strong></div>
                          <div>80+: <strong>{game.player2_stats.count80}</strong></div>
                          <div>100+: <strong>{game.player2_stats.count100}</strong></div>
                          <div>140+: <strong>{game.player2_stats.count140}</strong></div>
                          <div>180s: <strong>{game.player2_stats.count180}</strong></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
