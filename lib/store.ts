import fs from 'fs';
import path from 'path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const OUTPUTS_DIR = path.join(DATA_DIR, 'outputs');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
const DB_FILE = path.join(DATA_DIR, 'projects.json');

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

function ensureDirs() {
  for (const d of [DATA_DIR, UPLOADS_DIR, OUTPUTS_DIR, TMP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

export function listProjects(): Project[] {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

export function getProject(id: string): Project | undefined {
  return listProjects().find((p) => p.id === id);
}

export function saveProject(project: Project) {
  ensureDirs();
  const all = listProjects().filter((p) => p.id !== project.id);
  all.unshift(project);
  fs.writeFileSync(DB_FILE, JSON.stringify(all, null, 2));
}
