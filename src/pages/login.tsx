import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      // Update online status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('users').update({ is_online: true }).eq('id', user.id);
      }
      router.push('/');
    }
    setLoading(false);
  }

  return (
    <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ minWidth: '400px', padding: '40px' }}>
        <h1 className="logo" style={{ textAlign: 'center', marginBottom: '30px', fontSize: '2rem' }}>
          GB Darts
        </h1>
        <h2 className="card-title" style={{ marginBottom: '25px' }}>Login</h2>
        
        {error && (
          <div style={{ color: '#ff3366', textAlign: 'center', marginBottom: '20px', padding: '10px', background: 'rgba(255,51,102,0.1)', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
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
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '25px', color: '#8b9dc3' }}>
          Don't have an account?{' '}
          <Link href="/register" style={{ color: '#00d4ff' }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
