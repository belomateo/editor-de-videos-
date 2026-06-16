import { NextResponse } from 'next/server';
import { getProject } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const p = await getProject(params.id);
  if (!p) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  return NextResponse.json(p);
}
