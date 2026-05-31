import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Settings() {
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();

  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    if (selectedCamera) {
      startWebcam(selectedCamera);
    }
  }, [selectedCamera]);

  async function getUser() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      router.push('/login');
      return;
    }
    
    const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single();
    if (data) {
      setUser(data);
      setUsername(data.username);
      setEmail(data.email);
    }
  }

  async function requestCameraPermission() {
    try {
      // First request permission by getting user media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      
      // Keep stream active briefly to ensure labels are populated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now enumerate devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      console.log('Found cameras:', videoDevices);
      
      if (videoDevices.length === 0) {
        alert('No cameras found. Please check your device.');
        return;
      }
      
      setCameras(videoDevices);
      setSelectedCamera(videoDevices[0].deviceId);
      
      // Start the first camera
      startWebcam(videoDevices[0].deviceId);
      
    } catch (err) {
      console.error('Camera permission error:', err);
      alert('Camera access denied. Please allow camera access in your browser settings and refresh the page.');
    }
  }

  async function startWebcam(deviceId: string) {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined },
        audio: false
      });
      
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.log('Webcam error:', err);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('users')
      .update({ username })
      .eq('id', user.id);

    if (error) {
      setMessage('Error saving: ' + error.message);
    } else {
      setMessage('Settings saved!');
    }
    setSaving(false);
  }

  async function logout() {
    await supabase.from('users').update({ is_online: false }).eq('id', user.id);
    await supabase.auth.signOut();
    router.push('/');
  }

  if (!user) return <div style={{ padding: 40, textAlign: 'center', color: '#00d4ff' }}>Loading...</div>;

  return (
    <div className="container">
      <header className="header">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <h1 className="logo">GB Darts</h1>
        </Link>
        <div className="nav-buttons">
          <span style={{ color: '#00d4ff', alignSelf: 'center', marginRight: '15px' }}>
            {user.username}
          </span>
          <button className="btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="card" style={{ marginBottom: '25px' }}>
          <h2 className="card-title">Profile Settings</h2>
          
          {message && (
            <div style={{ 
              padding: '15px', 
              marginBottom: '20px', 
              background: message.includes('Error') ? 'rgba(255,51,102,0.1)' : 'rgba(0,255,136,0.1)',
              border: `1px solid ${message.includes('Error') ? '#ff3366' : '#00ff88'}`,
              borderRadius: '8px',
              color: message.includes('Error') ? '#ff3366' : '#00ff88',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}

          <form onSubmit={saveSettings}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                minLength={3}
                maxLength={20}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={email}
                disabled
                style={{ opacity: 0.6 }}
              />
              <small style={{ color: '#8b9dc3' }}>Email cannot be changed</small>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2 className="card-title">Webcam Settings</h2>
          
          {cameras.length === 0 ? (
            <button className="btn btn-primary" onClick={requestCameraPermission} style={{ width: '100%', marginBottom: '20px' }}>
              Enable Camera Access
            </button>
          ) : (
            <div className="form-group">
              <label className="form-label">Select Camera</label>
              <select
                className="form-select"
                value={selectedCamera}
                onChange={e => setSelectedCamera(e.target.value)}
              >
                {cameras.map(camera => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Camera ${cameras.indexOf(camera) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ 
            background: '#000', 
            borderRadius: '12px', 
            overflow: 'hidden',
            border: '2px solid rgba(0, 212, 255, 0.4)',
            marginTop: '20px',
            aspectRatio: '1 / 1',
            maxWidth: '400px',
            margin: '20px auto 0'
          }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          
          <p style={{ textAlign: 'center', marginTop: '15px', color: '#8b9dc3' }}>
            Webcam preview — this is how other players will see you
          </p>


        </div>
      </div>
    </div>
  );
}
