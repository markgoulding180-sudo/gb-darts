import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import type { Game, Throw } from '../../lib/types';

interface PlayerStats {
  dartsThrown: number;
  avg: number;
  count80: number;
  count100: number;
  count140: number;
  count180: number;
}

export default function GamePage() {
  const router = useRouter();
  const { id } = router.query;
  const [game, setGame] = useState<Game | null>(null);
  const [throws, setThrows] = useState<Throw[]>([]);
  const [currentScore, setCurrentScore] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [player1Stats, setPlayer1Stats] = useState<PlayerStats>({ dartsThrown: 0, avg: 0, count80: 0, count100: 0, count140: 0, count180: 0 });
  const [player2Stats, setPlayer2Stats] = useState<PlayerStats>({ dartsThrown: 0, avg: 0, count80: 0, count100: 0, count140: 0, count180: 0 });
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    
    fetchGame();
    fetchThrows();
    getCurrentUser();
    initWebcam();

    const gameChannel = supabase
      .channel(`game:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${id}` }, fetchGame)
      .subscribe();

    const throwsChannel = supabase
      .channel(`throws:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'throws', filter: `game_id=eq.${id}` }, fetchThrows)
      .subscribe();

    return () => {
      gameChannel.unsubscribe();
      throwsChannel.unsubscribe();
    };
  }, [id]);

  useEffect(() => {
    calculateStats();
  }, [throws, game]);

  useEffect(() => {
    if (game && currentUser && game.current_player === currentUser.id && game.status === 'playing') {
      inputRef.current?.focus();
    }
  }, [game?.current_player, currentUser?.id]);

  async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      setCurrentUser(data);
    }
  }

  async function initWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.log('Webcam not available');
    }
  }

  async function fetchGame() {
    const { data } = await supabase.from('games').select('*').eq('id', id).single();
    if (data) setGame(data);
  }

  async function fetchThrows() {
    const { data } = await supabase.from('throws').select('*').eq('game_id', id).order('created_at');
    if (data) setThrows(data);
  }

  function calculateStats() {
    if (!game) return;
    const p1Throws = throws.filter(t => t.player_id === game.player1_id && !t.is_bust);
    const p2Throws = throws.filter(t => t.player_id === game.player2_id && !t.is_bust);
    setPlayer1Stats(calcPlayerStats(p1Throws));
    setPlayer2Stats(calcPlayerStats(p2Throws));
  }

  function calcPlayerStats(playerThrows: Throw[]): PlayerStats {
    const totalScore = playerThrows.reduce((sum, t) => sum + t.score, 0);
    const dartsThrown = playerThrows.length * 3;
    const avg = dartsThrown > 0 ? (totalScore / dartsThrown) * 3 : 0;
    return {
      dartsThrown,
      avg: Math.round(avg * 10) / 10,
      count80: playerThrows.filter(t => t.score >= 80 && t.score < 100).length,
      count100: playerThrows.filter(t => t.score >= 100 && t.score < 140).length,
      count140: playerThrows.filter(t => t.score >= 140 && t.score < 180).length,
      count180: playerThrows.filter(t => t.score === 180).length,
    };
  }

  function getPlayerThrows(playerId: string): Throw[] {
    return throws.filter(t => t.player_id === playerId).slice(-3);
  }

  async function submitScore(e?: React.FormEvent) {
    e?.preventDefault();
    if (!game || !currentUser || !currentScore) return;
    const score = parseInt(currentScore);
    if (isNaN(score) || score < 0 || score > 180) return;

    const isPlayer1 = game.player1_id === currentUser.id;
    const currentTotal = isPlayer1 ? game.player1_score : game.player2_score;
    const remaining = currentTotal - score;
    const isBust = remaining < 0 || remaining === 1;
    const newRemaining = isBust ? currentTotal : remaining;
    const isCheckout = remaining === 0;

    await supabase.from('throws').insert({
      game_id: game.id,
      player_id: currentUser.id,
      score: score,
      darts: 3,
      remaining: newRemaining,
      is_bust: isBust,
    });

    const updates: any = { current_player: isPlayer1 ? game.player2_id : game.player1_id };
    if (isPlayer1) updates.player1_score = newRemaining;
    else updates.player2_score = newRemaining;

    if (isCheckout) {
      if (isPlayer1) updates.player1_legs = game.player1_legs + 1;
      else updates.player2_legs = game.player2_legs + 1;

      const newLegs = isPlayer1 ? game.player1_legs + 1 : game.player2_legs + 1;
      if (newLegs >= game.legs_to_win) {
        updates.status = 'finished';
        updates.winner = isPlayer1 ? game.player1_id : game.player2_id;
      } else {
        updates.current_leg = game.current_leg + 1;
        updates.player1_score = game.start_score;
        updates.player2_score = game.start_score;
        updates.current_player = game.player1_id;
      }
    }

    await supabase.from('games').update(updates).eq('id', game.id);
    setCurrentScore('');
  }

  if (!game) return <div style={{ padding: 40, textAlign: 'center', color: '#00d4ff' }}>Loading...</div>;

  const isMyTurn = game.current_player === currentUser?.id;
  const isPlayer1 = currentUser?.id === game.player1_id;
  const opponentId = isPlayer1 ? game.player2_id : game.player1_id;
  const opponentName = isPlayer1 ? game.player2_name : game.player1_name;
  const myName = isPlayer1 ? game.player1_name : game.player2_name;
  const myScore = isPlayer1 ? game.player1_score : game.player2_score;
  const opponentScore = isPlayer1 ? game.player2_score : game.player1_score;
  const myLegs = isPlayer1 ? game.player1_legs : game.player2_legs;
  const opponentLegs = isPlayer1 ? game.player2_legs : game.player1_legs;
  const myStats = isPlayer1 ? player1Stats : player2Stats;
  const opponentStats = isPlayer1 ? player2Stats : player1Stats;
  const myThrows = getPlayerThrows(currentUser?.id || '');
  const opponentThrows = getPlayerThrows(opponentId);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1429 100%)', padding: '10px 20px', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,212,255,0.2)', marginBottom: '10px' }}>
        <div style={{ fontSize: '0.9rem', color: '#00d4ff', textTransform: 'uppercase', letterSpacing: '2px' }}>GB Darts</div>
        <div style={{ fontSize: '1rem', fontWeight: '700' }}>
          First to {game.legs_to_win} Legs · Leg {game.current_leg} · {game.player1_legs}-{game.player2_legs}
        </div>
      </div>

      {/* Main Layout: Scoreboard Left, Webcam Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '15px', flex: 1 }}>
        
        {/* LEFT: Scoreboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Big Scores Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {/* My Score */}
            <div style={{
              textAlign: 'center',
              padding: '15px',
              background: isMyTurn ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.05)',
              border: `3px solid ${isMyTurn ? '#00d4ff' : 'rgba(0,212,255,0.3)'}`,
              borderRadius: '10px',
              boxShadow: isMyTurn ? '0 0 20px rgba(0,212,255,0.3)' : 'none',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#8b9dc3', marginBottom: '5px' }}>{myName} (You)</div>
              <div style={{ fontSize: '4rem', fontWeight: '900', color: '#00d4ff', textShadow: '0 0 20px rgba(0,212,255,0.5)', lineHeight: 1 }}>
                {myScore}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#00ff88' }}>Legs: {myLegs}</div>
            </div>

            {/* Opponent Score */}
            <div style={{
              textAlign: 'center',
              padding: '15px',
              background: !isMyTurn ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.05)',
              border: `3px solid ${!isMyTurn ? '#00d4ff' : 'rgba(0,212,255,0.3)'}`,
              borderRadius: '10px',
              boxShadow: !isMyTurn ? '0 0 20px rgba(0,212,255,0.3)' : 'none',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#8b9dc3', marginBottom: '5px' }}>{opponentName}</div>
              <div style={{ fontSize: '4rem', fontWeight: '900', color: '#00d4ff', textShadow: '0 0 20px rgba(0,212,255,0.5)', lineHeight: 1 }}>
                {opponentScore}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#00ff88' }}>Legs: {opponentLegs}</div>
            </div>
          </div>

          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <StatsBox label={myName} stats={myStats} />
            <StatsBox label={opponentName} stats={opponentStats} />
          </div>

          {/* Last Throws Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flex: 1 }}>
            <ThrowsBox throws={myThrows} label="Your Last Throws" />
            <ThrowsBox throws={opponentThrows} label={`${opponentName}'s Last Throws`} />
          </div>
        </div>

        {/* RIGHT: Webcam */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Opponent Webcam - Big */}
          <div style={{
            flex: 1,
            background: '#000',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '2px solid rgba(0,212,255,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
          }}>
            <span style={{ color: '#333', fontSize: '1rem' }}>{opponentName}'s Webcam</span>
          </div>

          {/* My Webcam - Small Square, Left Aligned */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              background: '#000',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid rgba(0,212,255,0.3)',
            }}>
              <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Score Input - Bottom */}
      {isMyTurn && game.status === 'playing' && (
        <form onSubmit={submitScore} style={{ display: 'flex', justifyContent: 'center', gap: '10px', padding: '10px', borderTop: '1px solid rgba(0,212,255,0.2)' }}>
          <input
            ref={inputRef}
            type="number"
            placeholder="Score (0-180)"
            value={currentScore}
            onChange={e => setCurrentScore(e.target.value)}
            min="0"
            max="180"
            autoFocus
            style={{
              width: '140px',
              padding: '10px 15px',
              background: 'rgba(0,212,255,0.05)',
              border: '2px solid rgba(0,212,255,0.5)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '1.1rem',
              textAlign: 'center',
              outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '10px 25px',
            background: '#00d4ff',
            border: 'none',
            borderRadius: '8px',
            color: '#0a0e1a',
            fontWeight: '700',
            fontSize: '1rem',
            cursor: 'pointer',
          }}>
            Enter
          </button>
        </form>
      )}

      {!isMyTurn && game.status === 'playing' && (
        <div style={{ textAlign: 'center', padding: '15px', color: '#8b9dc3', borderTop: '1px solid rgba(0,212,255,0.2)' }}>
          Waiting for {opponentName}...
        </div>
      )}

      {game.status === 'finished' && (
        <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(0,255,136,0.1)', borderTop: '1px solid rgba(0,255,136,0.3)' }}>
          <div style={{ fontSize: '1.3rem', color: '#00ff88', fontWeight: '700' }}>Game Over!</div>
          <div style={{ marginTop: '5px' }}>Winner: {game.winner === currentUser?.id ? myName : opponentName}</div>
          <button onClick={() => router.push('/')} style={{
            marginTop: '10px',
            padding: '8px 20px',
            background: '#00d4ff',
            border: 'none',
            borderRadius: '8px',
            color: '#0a0e1a',
            fontWeight: '600',
            cursor: 'pointer',
          }}>
            Back to Lobby
          </button>
        </div>
      )}
    </div>
  );
}

function StatsBox({ label, stats }: { label: string; stats: PlayerStats }) {
  return (
    <div style={{
      padding: '10px',
      background: 'rgba(0,212,255,0.05)',
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: '8px',
    }}>
      <div style={{ fontSize: '0.75rem', color: '#8b9dc3', marginBottom: '8px', textTransform: 'uppercase' }}>{label} Stats</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '0.8rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#00d4ff', fontWeight: '700' }}>{stats.avg}</div>
          <div style={{ fontSize: '0.65rem', color: '#8b9dc3' }}>Avg</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#00d4ff', fontWeight: '700' }}>{stats.count100}</div>
          <div style={{ fontSize: '0.65rem', color: '#8b9dc3' }}>100+</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#00d4ff', fontWeight: '700' }}>{stats.count140}</div>
          <div style={{ fontSize: '0.65rem', color: '#8b9dc3' }}>140+</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#00d4ff', fontWeight: '700' }}>{stats.count180}</div>
          <div style={{ fontSize: '0.65rem', color: '#8b9dc3' }}>180s</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#00d4ff', fontWeight: '700' }}>{stats.dartsThrown}</div>
          <div style={{ fontSize: '0.65rem', color: '#8b9dc3' }}>Darts</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#00d4ff', fontWeight: '700' }}>{stats.count80}</div>
          <div style={{ fontSize: '0.65rem', color: '#8b9dc3' }}>80+</div>
        </div>
      </div>
    </div>
  );
}

function ThrowsBox({ throws, label }: { throws: Throw[]; label: string }) {
  return (
    <div style={{
      padding: '10px',
      background: 'rgba(0,212,255,0.05)',
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: '8px',
    }}>
      <div style={{ fontSize: '0.75rem', color: '#8b9dc3', marginBottom: '8px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {[0, 1, 2].map((i) => {
          const t = throws[throws.length - 1 - i];
          return (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 10px',
              background: t ? (t.is_bust ? 'rgba(255,51,102,0.1)' : 'rgba(0,212,255,0.1)') : 'rgba(255,255,255,0.02)',
              border: `1px solid ${t ? (t.is_bust ? '#ff3366' : 'rgba(0,212,255,0.3)') : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '4px',
            }}>
              <span style={{ fontSize: '0.7rem', color: '#8b9dc3' }}>
                {t ? `D${(throws.length - i) * 3 - 2}-${(throws.length - i) * 3}` : '-'}
              </span>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: t ? (t.is_bust ? '#ff3366' : '#fff') : '#555' }}>
                {t ? `${t.score}${t.is_bust ? ' B' : ''}` : '-'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
