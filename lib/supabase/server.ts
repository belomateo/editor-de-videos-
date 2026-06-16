import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente para API routes / server components. Lee la sesión desde las cookies.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component; se puede ignorar si hay middleware refrescando sesión
          }
        },
      },
    }
  );
}

// Cliente admin con la secret key — salta RLS. SOLO para tareas de servidor de confianza
// (ej: el script de migración). Nunca exponer al cliente.
import { createClient as createRawClient } from '@supabase/supabase-js';
export function createAdminClient() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}
