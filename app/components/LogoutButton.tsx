'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-xs text-mute hover:text-zinc-200 transition ml-auto">
      Salir
    </button>
  );
}
