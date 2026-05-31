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
  highestFinish: number;
  bestLeg: number;
  worstLeg: number;
}

export default function GamePage() {
  const router = useRouter();
  const { id } = router.query;
  const [game, setGame] = useState<Game | null>(null);
  const [throws, setThrows] = useState<Throw[]>([]);
  const [currentScore, setCurrentScore] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [player1Stats, setPlayer1Stats] = useState<PlayerStats>({ dartsThrown: 0, avg: 0, count80: 0, count100: 0, count140: 0, count180: 0, highestFinish: 0, bestLeg: 0, worstLeg: 0 });
  const [player2Stats, setPlayer2Stats] = useState<PlayerStats>({ dartsThrown: 0, avg: 0, count80: 0, count100: 0, count140: 0, count180: 0, highestFinish: 0, bestLeg: 0, worstLeg: 0 });
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

  // Auto-focus input on your turn
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
      highestFinish: 0, // Would need checkout tracking
      bestLeg: 0,
      worstLeg: 0,
    };
  }

  function getPlayerThrows(playerId: string): Throw[] {
    return throws.filter(t => t.player_id === playerId).slice(-2);
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

    const updates: any = {
      current_player: isPlayer1 ? game.player2_id : game.player1_id,
    };

    if (isPlayer1) {
      updates.player1_score = newRemaining;
    } else {
      updates.player2_score = newRemaining;
    }

    if (isCheckout) {
      if (isPlayer1) {
        updates.player1_legs = game.player1_legs + 1;
      } else {
        updates.player2_legs = game.player2_legs + 1;
      }

      const legsToWin = game.legs_to_win;
      const newLegs = isPlayer1 ? game.player1_legs + 1 : game.player2_legs + 1;
      
      if (newLegs >= legsToWin) {
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

  async function editThrow(throwId: string, newScore: number) {
    // For now just console log - would need more complex logic to recalculate
    console.log('Edit throw:', throwId, newScore);
  }

  if (!game) return <div style={{ padding: 40, textAlign: 'center', color: '#00d4ff' }}>Loading...</div>;

  const isMyTurn = game.current_player === currentUser?.id;
  const isPlayer1 = currentUser?.id === game.player1_id;
  const p1Throws = getPlayerThrows(game.player1_id);
  const p2Throws = getPlayerThrows(game.player2_id);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1429 100%)', padding: '10px 20px', display: 'flex', flexDirection: 'column' }}>
      {/* Compact Header */}
      <div style={{ textAlign: 'center', padding: '10px 0', borderBottom: '1px solid rgba(0,212,255,0.2)', marginBottom: '15px' }}>
        <div style={{ fontSize: '1rem', color: '#00d4ff', textTransform: 'uppercase', letterSpacing: '2px' }}>Darts</div>
        <div style={{ fontSize: '1.2rem', fontWeight: '700', marginTop: '5px' }}>
          First to {game.legs_to_win} Legs · Leg {game.current_leg} · {game.player1_legs}-{game.player2_legs}
        </div>
      </div>

      {/* Two Column Layout - Compact */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', flex: 1, overflow: 'hidden' }}>
        
        {/* Player 1 Column */}
        <PlayerColumn 
          playerName={game.player1_name}
          score={game.player1_score}
          legs={game.player1_legs}
          isCurrentPlayer={game.current_player === game.player1_id}
          isMe={isPlayer1}
          videoRef={isPlayer1 ? localVideoRef : undefined}
          throws={p1Throws}
          stats={player1Stats}
          gameStatus={game.status}
        />

        {/* Player 2 Column */}
        <PlayerColumn 
          playerName={game.player2_name}
          score={game.player2_score}
          legs={game.player2_legs}
          isCurrentPlayer={game.current_player === game.player2_id}
          isMe={!isPlayer1}
          videoRef={!isPlayer1 ? localVideoRef : undefined}
          throws={p2Throws}
          stats={player2Stats}
          gameStatus={game.status}
        />
      </div>

      {/* Score Input - Bottom Center */}
      {isMyTurn && game.status === 'playing' && (
        <form onSubmit={submitScore} style={{ display: 'flex', justifyContent: 'center', gap: '10px', padding: '15px', borderTop: '1px solid rgba(0,212,255,0.2)' }}>
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
              width: '150px',
              padding: '12px 15px',
              background: 'rgba(0,212,255,0.05)',
              border: '2px solid rgba(0,212,255,0.5)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '1.2rem',
              textAlign: 'center',
              outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '12px 30px',
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
        <div style={{ textAlign: 'center', padding: '20px', color: '#8b9dc3', borderTop: '1px solid rgba(0,212,255,0.2)' }}>
          Waiting for opponent...
        </div>
      )}

      {game.status === 'finished' && (
        <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(0,255,136,0.1)', borderTop: '1px solid rgba(0,255,136,0.3)' }}>
          <div style={{ fontSize: '1.5rem', color: '#00ff88', fontWeight: '700' }}>Game Over!</div>
          <div style={{ marginTop: '10px' }}>Winner: {game.winner === game.player1_id ? game.player1_name : game.player2_name}</div>
          <button onClick={() => router.push('/')} style={{
            marginTop: '15px',
            padding: '10px 25px',
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

interface PlayerColumnProps {
  playerName: string;
  score: number;
  legs: number;
  isCurrentPlayer: boolean;
  isMe: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  throws: Throw[];
  stats: PlayerStats;
  gameStatus: string;
}

function PlayerColumn({ playerName, score, legs, isCurrentPlayer, isMe, videoRef, throws, stats, gameStatus }: PlayerColumnProps) {
  return (
    <div style={{
      background: 'rgba(0,212,255,0.05)',
      border: `2px solid ${isCurrentPlayer ? '#00d4ff' : 'rgba(0,212,255,0.3)'}`,
      borderRadius: '8px',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: isCurrentPlayer ? '0 0 15px rgba(0,212,255,0.2)' : 'none',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid rgba(0,212,255,0.2)' }}>
        <span style={{ fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase' }}>{playerName}</span>
        <span style={{ color: '#00d4ff', fontSize: '0.8rem' }}>Legs: {legs}</span>
      </div>

      {/* Webcam - Smaller */}
      <div style={{
        background: '#000',
        borderRadius: '6px',
        overflow: 'hidden',
        height: '140px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {videoRef ? (
          <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: '#444', fontSize: '0.75rem' }}>Opponent Webcam</span>
        )}
      </div>

      {/* Big Score - Compact */}
      <div style={{
        textAlign: 'center',
        padding: '8px',
        background: 'rgba(0,212,255,0.1)',
        borderRadius: '6px',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: '3rem', fontWeight: '900', color: '#00d4ff', textShadow: '0 0 15px rgba(0,212,255,0.5)', lineHeight: 1 }}>
          {score}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#8b9dc3' }}>TO GO</div>
      </div>

      {/* Last 2 Throws - Compact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
        <div style={{ fontSize: '0.65rem', color: '#8b9dc3', textTransform: 'uppercase' }}>Last Throws</div>
        {[0, 1].map((i) => {
          const t = throws[throws.length - 1 - i];
          return (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 10px',
              background: t ? (t.is_bust ? 'rgba(255,51,102,0.1)' : 'rgba(0,212,255,0.1)') : 'rgba(255,255,255,0.02)',
              border: `1px solid ${t ? (t.is_bust ? '#ff3366' : 'rgba(0,212,255,0.3)') : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '4px',
              cursor: t ? 'pointer' : 'default',
            }}>
              <span style={{ fontSize: '0.7rem', color: '#8b9dc3' }}>
                {t ? `Darts ${(throws.length - i) * 3 - 2}-${(throws.length - i) * 3}` : '-'}
              </span>
              <span style={{ fontWeight: '700', fontSize: '0.85rem', color: t ? (t.is_bust ? '#ff3366' : '#fff') : '#555' }}>
                {t ? `${t.score}${t.is_bust ? ' B' : ''}` : '-'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats - Compact Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '5px',
        padding: '8px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '6px',
        fontSize: '0.7rem',
        marginTop: 'auto',
      }}>
        <StatBox label="Avg" value={stats.avg.toString()} />
        <StatBox label="80+" value={stats.count80.toString()} />
        <StatBox label="100+" value={stats.count100.toString()} />
        <StatBox label="140+" value={stats.count140.toString()} />
        <StatBox label="180s" value={stats.count180.toString()} />
        <StatBox label="Darts" value={stats.dartsThrown.toString()} />
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.6rem', color: '#8b9dc3', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#00d4ff' }}>{value}</div>
    </div>
  );
}
