import { NextResponse } from 'next/server';

export function adminFailure(code: string, message: string, status = 400, field?: string) {
  return NextResponse.json(
    { code, error: message, message, ...(field ? { field } : {}) },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

export function databaseFailure(error: { code?: string }, context: string) {
  // Never print raw database/provider messages: they can include personal data.
  console.error(
    JSON.stringify({
      event: 'admin_mutation_failed',
      operation: context,
      databaseCode: error.code ?? 'unknown',
    })
  );
  if (error.code === '42501')
    return adminFailure('FORBIDDEN', 'Your role cannot perform this action.', 403);
  if (error.code === '23505')
    return adminFailure('CONFLICT', 'That identifier or reference is already in use.', 409);
  return adminFailure(
    'INVALID_TRANSITION',
    'Change rejected. Check the current state, required fields and linked records.',
    409
  );
}
