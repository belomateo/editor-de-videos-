import path from 'path';
import { createClient } from './supabase/server';

// ── Rutas locales (los videos pesados siguen en disco, no en la nube) ──
export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const OUTPUTS_DIR = path.join(DATA_DIR, 'outputs');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');

// ── Tipos (idénticos a antes) ──
export type Word = { word: string; start: number; end: number };
export type Cut = { start: number; end: number; razon: string };
export type Zoom = { start: number; end: number; scale: number; razon: string };
export type Analysis = {
  cortes: Cut[];
  zooms?: Zoom[];
  hooks: string[];
  captions: Record<string, string>;
  resumen?: string;
};
export type Render = {
  id: string;
  platform: 'vertical' | 'horizontal';
  file: string;
  label?: string;
  driveLink?: string;
  createdAt: string;
};
export type Clip = {
  start: number;
  end: number;
  titulo: string;
  hook: string;
  razon: string;
};
export type Project = {
  id: string;
  name: string;
  status: 'subido' | 'transcripto' | 'analizado' | 'renderizado';
  sourceFile: string;
  duration?: number;
  words?: Word[];
  transcript?: string;
  analysis?: Analysis;
  clips?: Clip[];
  renders?: Render[];
  createdAt: string;
};

// ── Acceso a datos vía Supabase ──
// El proyecto completo se guarda como JSON en la columna `data` de la tabla `projects`.

export async function listProjects(): Promise<Project[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('data')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Error listando proyectos:', error.message);
    return [];
  }
  return (data || []).map((row: any) => row.data as Project);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('data')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('Error obteniendo proyecto:', error.message);
    return undefined;
  }
  return data ? (data.data as Project) : undefined;
}

export async function saveProject(project: Project): Promise<void> {
  const supabase = createClient();
  // owner_id se setea desde la sesión activa (si la hay)
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData?.user?.id ?? null;

  const row: any = {
    id: project.id,
    data: project,
    updated_at: new Date().toISOString(),
  };
  if (ownerId) row.owner_id = ownerId;

  const { error } = await supabase.from('projects').upsert(row, { onConflict: 'id' });
  if (error) {
    console.error('Error guardando proyecto:', error.message);
    throw new Error('No se pudo guardar el proyecto: ' + error.message);
  }
}
