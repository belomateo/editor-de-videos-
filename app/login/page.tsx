'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function login() {
    if (!email || !password) return;
    setBusy(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError('Email o contraseña incorrectos.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">ZW·CLIPPER</h1>
          <p className="text-mute text-sm mt-1">Entrá con tu cuenta</p>
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-amber/60"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && login()}
          placeholder="Contraseña"
          className="w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-amber/60"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button onClick={login} disabled={busy || !email || !password}
          className="btn btn-amber w-full disabled:opacity-50">
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
