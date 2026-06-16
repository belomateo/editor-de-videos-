'use client';
import { createBrowserClient } from '@supabase/ssr';

// Cliente para el navegador (componentes). Usa la publishable key (pública, segura de exponer).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  );
}
