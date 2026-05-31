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
  currentAverage: number;
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

interface GameWithAvg extends GameHistory {
  myAvg: number;
  myDate: Date;
}

type TimeRange = 'days' | 'months' | 'years';

export default function Profile() {
  const router = useRouter();
  const { id } = router.query;
  const [player, setPlayer] = useState<any>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [games, setGames] = useState<GameWithAvg[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('days');

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
    
    const { data: playerData } = await supabase.from('users').select('*').eq('id', id).single();
    if (playerData) setPlayer(playerData);

    const { data: gameHistory } = await supabase
      .from('game_history')
      .select('*')
      .or(`player1_id.eq.${id},player2_id.eq.${id}`)
      .order('played_at', { ascending: true });

    if (gameHistory) {
      const gamesWithAvg = gameHistory.map((game: GameHistory) => {
        const isPlayer1 = game.player1_id === id;
        const myStats = isPlayer1 ? game.player1_stats : game.player2_stats;
        return {
          ...game,
          myAvg: myStats?.avg || 0,
          myDate: new Date(game.played_at),
        };
      });
      setGames(gamesWithAvg);
      calculateStats(gamesWithAvg);
    }
    
    setLoading(false);
  }

  function calculateStats(gamesWithAvg: GameWithAvg[]) {
    const totalGames = gamesWithAvg.length;
    let gamesWon = 0;
    let totalLegsPlayed = 0;
    let totalLegsWon = 0;
    let count80 = 0, count100 = 0, count140 = 0, count180 = 0;
    let highestAverage = 0;
    let totalAvg = 0;
    let highestFinish = 0, highestFinishCount = 0;

    gamesWithAvg.forEach(game => {
      const isPlayer1 = game.player1_id === id;
      const myStats = isPlayer1 ? game.player1_stats : game.player2_stats;
      const myLegs = isPlayer1 ? game.player1_legs : game.player2_legs;
      const opponentLegs = isPlayer1 ? game.player2_legs : game.player1_legs;
      
      if (game.winner_id === id) gamesWon++;
      totalLegsPlayed += myLegs + opponentLegs;
      totalLegsWon += myLegs;

      if (myStats) {
        count80 += myStats.count80 || 0;
        count100 += myStats.count100 || 0;
        count140 += myStats.count140 || 0;
        count180 += myStats.count180 || 0;
        if (myStats.avg > highestAverage) highestAverage = myStats.avg;
        totalAvg += myStats.avg || 0;
      }

      if (game.throws) {
        const myThrows = game.throws.filter((t: any) => t.player_id === id);
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
      gamesLost: totalGames - gamesWon,
      winPercentage: totalGames > 0 ? Math.round((gamesWon / totalGames) * 100) : 0,
      totalLegsPlayed,
      totalLegsWon,
      legsWinPercentage: totalLegsPlayed > 0 ? Math.round((totalLegsWon / totalLegsPlayed) * 100) : 0,
      count80, count100, count140, count180,
      highestAverage: Math.round(highestAverage * 100) / 100,
      currentAverage: totalGames > 0 ? Math.round((totalAvg / totalGames) * 100) / 100 : 0,
      highestFinish,
      highestFinishCount,
    });
  }

  function formatDate(date: Date, range: TimeRange): string {
    if (range === 'days') return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    if (range === 'months') return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    return date.toLocaleDateString('en-GB', { year: 'numeric' });
  }

  function getChartData(): { label: string; avg: number }[] {
    if (games.length === 0) return [];
    
    const grouped = new Map<string, number[]>();
    
    games.forEach(game => {
      const key = formatDate(game.myDate, timeRange);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(game.myAvg);
    });
    
    return Array.from(grouped.entries()).map(([label, avgs]) => ({
      label,
      avg: avgs.reduce((a, b) => a + b, 0) / avgs.length,
    }));
  }

  const chartData = getChartData();
  const maxAvg = Math.max(...chartData.map(d => d.avg), 100);

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
          <Link href="/stats"><button className="btn">Stats</button></Link>
          <Link href="/"><button className="btn">Back to Game</button></Link>
        </div>
      </header>

      {/* Player Header with Current Average */}
      <div style={{ textAlign: 'center', padding: '30px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '2.5rem', color: '#00d4ff', marginBottom: '10px' }}>
          {player.username}
        </h2>
        {stats && (
          <div style={{ fontSize: '1.5rem', color: '#ffd700', marginBottom: '10px' }}>
            Current Average: <strong>{stats.currentAverage.toFixed(2)}</strong>
          </div>
        )}
        {isMyProfile && <span style={{ color: '#00ff88' }}>⭐ This is you!</span>}
      </div>

      {/* Average Over Time Graph */}
      {games.length > 0 && (
        <div className="card" style={{ marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 className="card-title" style={{ margin: 0 }}>Average Over Time</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              {(['days', 'months', 'years'] as TimeRange[]).map(range => (
                <button
                  key={range}
                  className={`btn ${timeRange === range ? 'btn-primary' : ''}`}
                  onClick={() => setTimeRange(range)}
                  style={{ padding: '5px 15px', fontSize: '0.8rem', textTransform: 'capitalize' }}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          
          {/* Chart */}
          <div style={{ height: '200px', position: 'relative', marginTop: '30px' }}>
            {/* Y-axis labels */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: '30px', width: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '0.7rem', color: '#8b9dc3' }}>
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>
            
            {/* Chart area */}
            <div style={{ marginLeft: '50px', height: '100%', position: 'relative' }}>
              {/* Grid lines */}
              {[0, 25, 50, 75, 100].map(val => (
                <div key={val} style={{ position: 'absolute', bottom: `${val}%`, left: 0, right: 0, height: '1px', background: 'rgba(0,212,255,0.2)' }} />
              ))}
              
              {/* Bars */}
              <div style={{ display: 'flex', alignItems: 'flex-end', height: 'calc(100% - 30px)', gap: '5px', paddingRight: '10px' }}>
                {chartData.map((data, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div 
                      style={{ 
                        width: '100%', 
                        maxWidth: '40px',
                        height: `${(data.avg / maxAvg) * 100}%`, 
                        background: 'linear-gradient(to top, #00d4ff, #00ff88)',
                        borderRadius: '4px 4px 0 0',
                        minHeight: '5px',
                        position: 'relative',
                      }}
                      title={`${data.label}: ${data.avg.toFixed(2)}`}
                    >
                      <span style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', color: '#00d4ff', whiteSpace: 'nowrap' }}>
                        {data.avg.toFixed(1)}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.6rem', color: '#8b9dc3', marginTop: '5px', transform: 'rotate(-45deg)', transformOrigin: 'top left' }}>
                      {data.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
          <p style={{ color: '#8b9dc3', textAlign: 'center', padding: '20px' }}>No games played yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[...games].reverse().slice(0, 10).map(game => {
              const isPlayer1 = game.player1_id === id;
              const myLegs = isPlayer1 ? game.player1_legs : game.player2_legs;
              const opponentLegs = isPlayer1 ? game.player2_legs : game.player1_legs;
              const opponentName = isPlayer1 ? game.player2_name : game.player1_name;
              const won = game.winner_id === id;
              
              return (
                <div key={game.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(0,212,255,0.05)', border: `1px solid ${won ? '#00ff88' : '#ff3366'}`, borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '700' }}>vs {opponentName}</div>
                    <div style={{ fontSize: '0.8rem', color: '#8b9dc3' }}>
                      {game.myDate.toLocaleDateString('en-GB')} · Avg: {game.myAvg.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: won ? '#00ff88' : '#ff3366' }}>{myLegs} - {opponentLegs}</div>
                    <div style={{ fontSize: '0.75rem', color: won ? '#00ff88' : '#ff3366' }}>{won ? 'WON' : 'LOST'}</div>
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
    <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: '900', color, marginBottom: '5px' }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: '#8b9dc3', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}
