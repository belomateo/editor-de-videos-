// Migra los proyectos del JSON local a Supabase.
// Uso: node scripts/migrate-to-supabase.mjs
// Requiere las variables de entorno en .env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Cargar .env manualmente
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const DB_FILE = path.resolve(process.env.DATA_DIR || './data', 'projects.json');
if (!fs.existsSync(DB_FILE)) {
  console.log('No hay projects.json local. Nada para migrar.');
  process.exit(0);
}

const projects = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
console.log(`Encontrados ${projects.length} proyectos para migrar...`);

let ok = 0;
for (const p of projects) {
  const { error } = await supabase
    .from('projects')
    .upsert({ id: p.id, data: p, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) {
    console.error(`  ✗ ${p.id} (${p.name}): ${error.message}`);
  } else {
    console.log(`  ✓ ${p.id} (${p.name})`);
    ok++;
  }
}
console.log(`\nListo: ${ok}/${projects.length} proyectos migrados a Supabase.`);
