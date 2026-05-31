import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import type { Game, Throw } from '../../lib/types';

export default function GamePage() {
  const router = useRouter();
  const { id } = router.query;
  const [game, setGame] = useState<Game | null>(null);
  const [throws, setThrows] = useState<Throw[]>([]);
  const [currentScore, setCurrentScore] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!id) return;
    
    fetchGame();
    fetchThrows();
    getCurrentUser();

    const gameChannel = supabase
      .channel(`game:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${id}` }, fetchGame)
      .subscribe();

    const throwsChannel = supabase
      .channel(`throws:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'throws', filter: `game_id=eq.${id}` }, fetchThrows)
      .subscribe();

    // Initialize webcam
    initWebcam();

    return () => {
      gameChannel.unsubscribe();
      throwsChannel.unsubscribe();
    };
  }, [id]);

  async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      setCurrentUser(data);
    }
  }

  async function initWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

  async function submitScore() {
    if (!game || !currentUser || !currentScore) return;

    const score = parseInt(currentScore);
    if (isNaN(score) || score < 0 || score > 180) return;

    const isPlayer1 = game.player1_id === currentUser.id;
    const currentTotal = isPlayer1 ? game.player1_score : game.player2_score;
    const remaining = currentTotal - score;
    
    const isBust = remaining < 0 || remaining === 1;
    const newRemaining = isBust ? currentTotal : remaining;
    const isCheckout = remaining === 0;

    // Record the throw
    await supabase.from('throws').insert({
      game_id: game.id,
      player_id: currentUser.id,
      score: score,
      darts: 3,
      remaining: newRemaining,
      is_bust: isBust,
    });

    // Update game state
    const updates: any = {
      current_player: isPlayer1 ? game.player2_id : game.player1_id,
    };

    if (isPlayer1) {
      updates.player1_score = newRemaining;
    } else {
      updates.player2_score = newRemaining;
    }

    // Check for leg win
    if (isCheckout) {
      if (isPlayer1) {
        updates.player1_legs = game.player1_legs + 1;
      } else {
        updates.player2_legs = game.player2_legs + 1;
      }

      // Check for match win
      const legsToWin = game.legs_to_win;
      const newLegs = isPlayer1 ? game.player1_legs + 1 : game.player2_legs + 1;
      
      if (newLegs >= legsToWin) {
        updates.status = 'finished';
        updates.winner = isPlayer1 ? game.player1_id : game.player2_id;
      } else {
        // Start new leg
        updates.current_leg = game.current_leg + 1;
        updates.player1_score = game.start_score;
        updates.player2_score = game.start_score;
        updates.current_player = game.player1_id; // Player 1 always starts new leg
      }
    }

    await supabase.from('games').update(updates).eq('id', game.id);
    setCurrentScore('');
  }

  if (!game) return <div style={{ padding: 40, textAlign: 'center', color: '#00d4ff' }}>Loading...</div>;

  const isMyTurn = game.current_player === currentUser?.id;
  const isPlayer1 = currentUser?.id === game.player1_id;

  return (
    <div className="container">
      <div className="game-board">
        {/* Game Header */}
        <div className="game-header">
          <div className="game-title">Darts</div>
          <div className="game-subtitle">
            First to {game.legs_to_win} Legs · Leg {game.current_leg}
          </div>
          <div style={{ fontSize: '3rem', marginTop: '10px', color: '#00d4ff' }}>
            {game.player1_legs} - {game.player2_legs}
          </div>
        </div>

        {/* Players Area */}
        <div className="players-area">
          {/* Player 1 Webcam */}
          <div className="webcam-box">
            <div className="webcam-header">
              <span className="player-name">{game.player1_name}</span>
              <span className="player-flag">🇬🇧</span>
            </div>
            <div className="webcam-video">
              {isPlayer1 ? (
                <video ref={localVideoRef} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <video ref={remoteVideoRef} autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <div className="webcam-label">Webcam</div>
          </div>

          {/* Score Board */}
          <div className="score-board">
            <div className="score-header">
              <div className="score-header-cell">Scored</div>
              <div className="score-header-cell">To Go</div>
              <div className="score-header-cell">Legs</div>
              <div className="score-header-cell">To Go</div>
              <div className="score-header-cell">Scored</div>
            </div>

            <div className="score-row">
              <div className="score-cell">-</div>
              <div className={`score-cell highlight ${game.current_player === game.player1_id ? 'active-turn' : ''}`}>
                {game.player1_score}
              </div>
              <div className="score-divider">{game.player1_legs}</div>
              <div className={`score-cell highlight ${game.current_player === game.player2_id ? 'active-turn' : ''}`}>
                {game.player2_score}
              </div>
              <div className="score-cell">-</div>
            </div>

            {/* Last Throws */}
            {throws.length > 0 && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(0,212,255,0.2)' }}>
                <div style={{ color: '#8b9dc3', textAlign: 'center', marginBottom: '10px', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                  Last Throws
                </div>
                {throws.slice(-3).map((t, i) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px', color: t.is_bust ? '#ff3366' : '#fff' }}>
                    <span>{t.player_id === game.player1_id ? game.player1_name : game.player2_name}</span>
                    <span>{t.score} {t.is_bust && '(BUST)'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Big Scores */}
            <div className="big-scores">
              <div className="big-score">
                <div className="big-score-value">{game.player1_score}</div>
                <div className="big-score-label">{game.player1_name}</div>
              </div>
              <div className="big-score">
                <div className="big-score-value">{game.player2_score}</div>
                <div className="big-score-label">{game.player2_name}</div>
              </div>
            </div>

            {/* Score Input */}
            {isMyTurn && game.status === 'playing' && (
              <div style={{ marginTop: '25px', display: 'flex', gap: '15px' }}>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Enter score (0-180)"
                  value={currentScore}
                  onChange={e => setCurrentScore(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && submitScore()}
                  style={{ flex: 1, textAlign: 'center', fontSize: '1.2rem' }}
                  min="0"
                  max="180"
                />
                <button className="btn btn-primary" onClick={submitScore}>
                  Submit
                </button>
              </div>
            )}

            {!isMyTurn && game.status === 'playing' && (
              <div style={{ marginTop: '25px', textAlign: 'center', color: '#8b9dc3', padding: '15px' }}>
                Waiting for opponent...
              </div>
            )}

            {game.status === 'finished' && (
              <div style={{ marginTop: '25px', textAlign: 'center', padding: '20px', background: 'rgba(0,255,136,0.1)', borderRadius: '12px' }}>
                <div style={{ fontSize: '1.5rem', color: '#00ff88', fontWeight: '700' }}>
                  Game Over!
                </div>
                <div style={{ marginTop: '10px', color: '#fff' }}>
                  Winner: {game.winner === game.player1_id ? game.player1_name : game.player2_name}
                </div>
                <button className="btn btn-primary" style={{ marginTop: '15px' }} onClick={() => router.push('/')}>
                  Back to Lobby
                </button>
              </div>
            )}
          </div>

          {/* Player 2 Webcam */}
          <div className="webcam-box">
            <div className="webcam-header">
              <span className="player-name">{game.player2_name}</span>
              <span className="player-flag">🇬🇧</span>
            </div>
            <div className="webcam-video">
              {!isPlayer1 ? (
                <video ref={localVideoRef} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <video ref={remoteVideoRef} autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <div className="webcam-label">Webcam</div>
          </div>
        </div>
      </div>
    </div>
  );
}
