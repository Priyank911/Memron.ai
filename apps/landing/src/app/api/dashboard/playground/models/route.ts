import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { getPlaygroundModels } from '@/lib/rag';

export async function GET(request: NextRequest) {
  const user = await auth(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    models: getPlaygroundModels().filter(model => model.available),
  });
}
