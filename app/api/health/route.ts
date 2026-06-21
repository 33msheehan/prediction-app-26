import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  await sql`SELECT 1`;
  return NextResponse.json({ ok: true, db: 'connected' });
}
