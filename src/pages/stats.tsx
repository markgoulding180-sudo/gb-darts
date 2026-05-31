import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

interface PlayerStats {
  id: string;
  username: string;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  highestAvg: number;
  total180s: number;
}

interface GameHistory {
  id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
  player1_legs: number;
  player2_legs: number;
  winner_id: string;
  winner_name: string;
  start_score: number;
  played_at: string;
  player1_stats: any;
  player2_stats: any;
}

export default function Stats() {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerStats[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'games' | 'wins' | 'winRate' | 'avg' | '180s'>('games');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState<'players' | 'matches'>('players');
  const [matches, setMatches] = useState<GameHistory[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<GameHistory | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterAndSortPlayers();
  }, [players, searchTerm, sortBy]);

  async function loadData() {
    setLoading(true);
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase.from('users').select('*').eq('id', user.id).single();
      setCurrentUser(userData);
    }

    // Get all registered players
    const { data: allUsers } = await supabase.from('users').select('*').order('username');
    
    // Get all game history
    const { data: allGames } = await supabase.from('game_history').select('*');
    setMatches(allGames || []);

    if (allUsers && allGames) {
      // Calculate stats for each player
      const playerStats = allUsers.map(u => calculatePlayerStats(u, allGames));
      setPlayers(playerStats);
    }
    
    setLoading(false);
  }

  function calculatePlayerStats(user: any, games: GameHistory[]): PlayerStats {
    const userGames = games.filter(g => g.player1_id === user.id || g.player2_id === user.id);
    const gamesWon = userGames.filter(g => g.winner_id === user.id).length;
    
    let highestAvg = 0;
    let total180s = 0;
    
    userGames.forEach(game => {
      const isPlayer1 = game.player1_id === user.id;
      const stats = isPlayer1 ? game.player1_stats : game.player2_stats;
      if (stats) {
        if (stats.avg > highestAvg) highestAvg = stats.avg;
        total180s += stats.count180 || 0;
      }
    });

    return {
      id: user.id,
      username: user.username,
      gamesPlayed: userGames.length,
      gamesWon,
      winRate: userGames.length > 0 ? Math.round((gamesWon / userGames.length) * 100) : 0,
      highestAvg: Math.round(highestAvg * 100) / 100,
      total180s,
    };
  }

  function filterAndSortPlayers() {
    let filtered = players.filter(p => 
      p.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'games': return b.gamesPlayed - a.gamesPlayed;
        case 'wins': return b.gamesWon - a.gamesWon;
        case 'winRate': return b.winRate - a.winRate;
        case 'avg': return b.highestAvg - a.highestAvg;
        case '180s': return b.total180s - a.total180s;
        default: return 0;
      }
    });

    setFilteredPlayers(filtered);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#00d4ff' }}>Loading...</div>;

  return (
    <div className="container">
      <header className="header">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <h1 className="logo">GB Darts</h1>
        </Link>
        <div className="nav-buttons">
          {currentUser && (
            <span style={{ color: '#00d4ff', alignSelf: 'center', marginRight: '15px' }}>
              {currentUser.username}
            </span>
          )}
          <Link href="/">
            <button className="btn">Back to Game</button>
          </Link>
        </div>
      </header>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          className={`btn ${view === 'players' ? 'btn-primary' : ''}`}
          onClick={() => setView('players')}
        >
          Player Stats
        </button>
        <button 
          className={`btn ${view === 'matches' ? 'btn-primary' : ''}`}
          onClick={() => setView('matches')}
        >
          Match History
        </button>
      </div>

      {view === 'players' ? (
        <>
          {/* Filters */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#8b9dc3' }}>Search Players</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type username..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#8b9dc3' }}>Sort By</label>
                <select 
                  className="form-select"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                >
                  <option value="games">Games Played</option>
                  <option value="wins">Games Won</option>
                  <option value="winRate">Win Rate</option>
                  <option value="avg">Highest Average</option>
                  <option value="180s">180s</option>
                </select>
              </div>
            </div>
          </div>

          {/* Players Table */}
          <div className="card">
            <h2 className="card-title">All Players ({filteredPlayers.length})</h2>
            {filteredPlayers.length === 0 ? (
              <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '20px' }}>
                No players found
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(0,212,255,0.3)' }}>
                      <th style={{ textAlign: 'left', padding: '10px', color: '#00d4ff' }}>Player</th>
                      <th style={{ textAlign: 'center', padding: '10px', color: '#00d4ff' }}>Games</th>
                      <th style={{ textAlign: 'center', padding: '10px', color: '#00d4ff' }}>Won</th>
                      <th style={{ textAlign: 'center', padding: '10px', color: '#00d4ff' }}>Win %</th>
                      <th style={{ textAlign: 'center', padding: '10px', color: '#00d4ff' }}>Best Avg</th>
                      <th style={{ textAlign: 'center', padding: '10px', color: '#00d4ff' }}>180s</th>
                      <th style={{ textAlign: 'center', padding: '10px', color: '#00d4ff' }}>Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((player, index) => (
                      <tr 
                        key={player.id} 
                        style={{ 
                          borderBottom: '1px solid rgba(0,212,255,0.1)',
                          background: currentUser?.id === player.id ? 'rgba(0,255,136,0.1)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontWeight: '700' }}>
                            {index + 1}. {player.username}
                            {currentUser?.id === player.id && ' ⭐'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px' }}>{player.gamesPlayed}</td>
                        <td style={{ textAlign: 'center', padding: '10px', color: '#00ff88' }}>{player.gamesWon}</td>
                        <td style={{ textAlign: 'center', padding: '10px', color: '#00d4ff' }}>{player.winRate}%</td>
                        <td style={{ textAlign: 'center', padding: '10px', color: '#ffd700' }}>{player.highestAvg.toFixed(2)}</td>
                        <td style={{ textAlign: 'center', padding: '10px', color: '#ff3366' }}>{player.total180s}</td>
                        <td style={{ textAlign: 'center', padding: '10px' }}>
                          <Link href={`/profile/${player.id}`}>
                            <button className="btn" style={{ padding: '5px 10px', fontSize: '0.8rem' }}>View</button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Match History View */
        <>
          <h2 className="card-title" style={{ marginBottom: '20px' }}>All Matches ({matches.length})</h2>
          
          {matches.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: '#8b9dc3' }}>No completed games yet.</p>
              <Link href="/">
                <button className="btn btn-primary" style={{ marginTop: '15px' }}>Play a Game</button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {matches.map(match => (
                <div 
                  key={match.id} 
                  className="card"
                  style={{ 
                    cursor: 'pointer',
                    border: selectedMatch?.id === match.id ? '2px solid #00d4ff' : '1px solid rgba(0,212,255,0.3)',
                  }}
                  onClick={() => setSelectedMatch(selectedMatch?.id === match.id ? null : match)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                        {match.player1_name} vs {match.player2_name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#8b9dc3', marginTop: '5px' }}>
                        {formatDate(match.played_at)} · {match.start_score} · Match #{match.id.slice(0, 8).toUpperCase()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#00d4ff' }}>
                        {match.player1_legs} - {match.player2_legs}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#00ff88' }}>
                        Winner: {match.winner_name}
                      </div>
                    </div>
                  </div>

                  {/* Expanded stats */}
                  {selectedMatch?.id === match.id && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(0,212,255,0.2)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Player 1 Stats */}
                        <div style={{ padding: '15px', background: 'rgba(0,212,255,0.05)', borderRadius: '8px' }}>
                          <div style={{ fontWeight: '700', marginBottom: '10px', color: '#00d4ff' }}>{match.player1_name}</div>
                          {match.player1_stats && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.9rem' }}>
                              <div>Avg: <strong>{match.player1_stats.avg}</strong></div>
                              <div>Darts: <strong>{match.player1_stats.darts_thrown}</strong></div>
                              <div>80+: <strong>{match.player1_stats.count80}</strong></div>
                              <div>100+: <strong>{match.player1_stats.count100}</strong></div>
                              <div>140+: <strong>{match.player1_stats.count140}</strong></div>
                              <div>180s: <strong>{match.player1_stats.count180}</strong></div>
                            </div>
                          )}
                        </div>

                        {/* Player 2 Stats */}
                        <div style={{ padding: '15px', background: 'rgba(0,212,255,0.05)', borderRadius: '8px' }}>
                          <div style={{ fontWeight: '700', marginBottom: '10px', color: '#00d4ff' }}>{match.player2_name}</div>
                          {match.player2_stats && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.9rem' }}>
                              <div>Avg: <strong>{match.player2_stats.avg}</strong></div>
                              <div>Darts: <strong>{match.player2_stats.darts_thrown}</strong></div>
                              <div>80+: <strong>{match.player2_stats.count80}</strong></div>
                              <div>100+: <strong>{match.player2_stats.count100}</strong></div>
                              <div>140+: <strong>{match.player2_stats.count140}</strong></div>
                              <div>180s: <strong>{match.player2_stats.count180}</strong></div>
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
        </>
      )}
    </div>
  );
}
