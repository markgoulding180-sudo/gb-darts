import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Sign up user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      // Create user profile
      const { error: profileError } = await supabase.from('users').insert({
        id: authData.user.id,
        username,
        email,
        is_online: true,
        is_ready: false,
      });

      if (profileError) {
        setError(profileError.message);
      } else {
        router.push('/');
      }
    }
    setLoading(false);
  }

  return (
    <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ minWidth: '400px', padding: '40px' }}>
        <h1 className="logo" style={{ textAlign: 'center', marginBottom: '30px', fontSize: '2rem' }}>
          GB Darts
        </h1>
        <h2 className="card-title" style={{ marginBottom: '25px' }}>Register</h2>
        
        {error && (
          <div style={{ color: '#ff3366', textAlign: 'center', marginBottom: '20px', padding: '10px', background: 'rgba(255,51,102,0.1)', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '25px', color: '#8b9dc3' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#00d4ff' }}>
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
