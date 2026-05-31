import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

interface PlayerStats {
  totalGames: number;
  gamesWon: number;
  gamesLost: number;
  winPercentage: number;
  totalLegsPlayed: number;
  totalLegsWon: number;
  legsWinPercentage: number;
  count80: number;
  count100: number;
  count140: number;
  count180: number;
  highestAverage: number;
  highestFinish: number;
  highestFinishCount: number;
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
  throws: any[];
}

export default function Profile() {
  const router = useRouter();
  const { id } = router.query;
  const [player, setPlayer] = useState<any>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [games, setGames] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    fetchData();
    getCurrentUser();
  }, [id]);

  async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      setCurrentUser(data);
    }
  }

  async function fetchData() {
    setLoading(true);
    
    // Get player info
    const { data: playerData } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (playerData) {
      setPlayer(playerData);
    }

    // Get all games this player was in
    const { data: gameHistory } = await supabase
      .from('game_history')
      .select('*')
      .or(`player1_id.eq.${id},player2_id.eq.${id}`)
      .order('played_at', { ascending: false });

    if (gameHistory) {
      setGames(gameHistory);
      calculateStats(gameHistory, id as string);
    }
    
    setLoading(false);
  }

  function calculateStats(gameHistory: GameHistory[], playerId: string) {
    let totalGames = gameHistory.length;
    let gamesWon = 0;
    let gamesLost = 0;
    let totalLegsPlayed = 0;
    let totalLegsWon = 0;
    let count80 = 0;
    let count100 = 0;
    let count140 = 0;
    let count180 = 0;
    let highestAverage = 0;
    let highestFinish = 0;
    let highestFinishCount = 0;

    gameHistory.forEach(game => {
      const isPlayer1 = game.player1_id === playerId;
      const myStats = isPlayer1 ? game.player1_stats : game.player2_stats;
      const myLegs = isPlayer1 ? game.player1_legs : game.player2_legs;
      const opponentLegs = isPlayer1 ? game.player2_legs : game.player1_legs;
      
      // Games won/lost
      if (game.winner_id === playerId) {
        gamesWon++;
      } else {
        gamesLost++;
      }

      // Legs
      totalLegsPlayed += myLegs + opponentLegs;
      totalLegsWon += myLegs;

      // Stats from game
      if (myStats) {
        count80 += myStats.count80 || 0;
        count100 += myStats.count100 || 0;
        count140 += myStats.count140 || 0;
        count180 += myStats.count180 || 0;
        
        // Highest average
        if (myStats.avg > highestAverage) {
          highestAverage = myStats.avg;
        }
      }

      // Check throws for highest finish
      if (game.throws) {
        const myThrows = game.throws.filter((t: any) => t.player_id === playerId);
        myThrows.forEach((t: any) => {
          if (t.remaining === 0 && t.score > highestFinish) {
            highestFinish = t.score;
            highestFinishCount = 1;
          } else if (t.remaining === 0 && t.score === highestFinish) {
            highestFinishCount++;
          }
        });
      }
    });

    setStats({
      totalGames,
      gamesWon,
      gamesLost,
      winPercentage: totalGames > 0 ? Math.round((gamesWon / totalGames) * 100) : 0,
      totalLegsPlayed,
      totalLegsWon,
      legsWinPercentage: totalLegsPlayed > 0 ? Math.round((totalLegsWon / totalLegsPlayed) * 100) : 0,
      count80,
      count100,
      count140,
      count180,
      highestAverage,
      highestFinish,
      highestFinishCount,
    });
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#00d4ff' }}>Loading...</div>;

  if (!player) return <div style={{ padding: 40, textAlign: 'center', color: '#ff3366' }}>Player not found</div>;

  const isMyProfile = currentUser?.id === player.id;

  return (
    <div className="container">
      <header className="header">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <h1 className="logo">GB Darts</h1>
        </Link>
        <div className="nav-buttons">
          <Link href="/">
            <button className="btn">Back to Game</button>
          </Link>
        </div>
      </header>

      {/* Player Header */}
      <div style={{ textAlign: 'center', padding: '30px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '2.5rem', color: '#00d4ff', marginBottom: '10px' }}>
          {player.username}
        </h2>
        {isMyProfile && <span style={{ color: '#00ff88' }}>⭐ This is you!</span>}
      </div>

      {/* Stats Grid */}
      {stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '15px',
          marginBottom: '30px'
        }}>
          <StatCard label="Games Played" value={stats.totalGames} />
          <StatCard label="Games Won" value={stats.gamesWon} color="#00ff88" />
          <StatCard label="Games Lost" value={stats.gamesLost} color="#ff3366" />
          <StatCard label="Win %" value={`${stats.winPercentage}%`} color="#00d4ff" />
          <StatCard label="Legs Played" value={stats.totalLegsPlayed} />
          <StatCard label="Legs Won" value={stats.totalLegsWon} color="#00ff88" />
          <StatCard label="Leg Win %" value={`${stats.legsWinPercentage}%`} color="#00d4ff" />
          <StatCard label="80+ Shots" value={stats.count80} />
          <StatCard label="100+ Shots" value={stats.count100} />
          <StatCard label="140+ Shots" value={stats.count140} />
          <StatCard label="180s" value={stats.count180} color="#ffd700" />
          <StatCard label="Highest Avg" value={stats.highestAverage} color="#00d4ff" />
          <StatCard label="Highest Finish" value={stats.highestFinish} color="#ff3366" />
          <StatCard label="Times Hit" value={stats.highestFinishCount} />
        </div>
      )}

      {/* Recent Games */}
      <div className="card">
        <h2 className="card-title">Recent Games</h2>
        {games.length === 0 ? (
          <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '20px' }}>
            No games played yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {games.slice(0, 10).map(game => {
              const isPlayer1 = game.player1_id === id;
              const myLegs = isPlayer1 ? game.player1_legs : game.player2_legs;
              const opponentLegs = isPlayer1 ? game.player2_legs : game.player1_legs;
              const opponentName = isPlayer1 ? game.player2_name : game.player1_name;
              const won = game.winner_id === id;
              
              return (
                <div 
                  key={game.id} 
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '15px',
                    background: 'rgba(0,212,255,0.05)',
                    border: `1px solid ${won ? '#00ff88' : '#ff3366'}`,
                    borderRadius: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '700' }}>
                      vs {opponentName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#8b9dc3' }}>
                      {formatDate(game.played_at)} · {game.start_score}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: won ? '#00ff88' : '#ff3366' }}>
                      {myLegs} - {opponentLegs}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: won ? '#00ff88' : '#ff3366' }}>
                      {won ? 'WON' : 'LOST'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = '#fff' }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: 'rgba(0,212,255,0.05)',
      border: '1px solid rgba(0,212,255,0.3)',
      borderRadius: '12px',
      padding: '20px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2rem', fontWeight: '900', color, marginBottom: '5px' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#8b9dc3', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}
