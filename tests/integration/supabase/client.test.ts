import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { createAdminClient } from '@/lib/supabase/admin';

describe('Supabase Client Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmVldF9jdWx0dXJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.local_anon_key';
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmVldF9jdWx0dXJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.local_service_role_key';
  });

  it('initializes browser client with valid public variables', () => {
    const client = createBrowserClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('throws an error if NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => createBrowserClient()).toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  });

  it('throws an error if admin client is called in browser environment', () => {
    expect(() => createAdminClient()).toThrow(
      'Supabase admin client must never be instantiated on the client side.'
    );
  });

  it('initializes admin client in server-side environment', () => {
    const originalWindow = global.window;
    // @ts-expect-error simulating server environment without window
    delete global.window;
    try {
      const admin = createAdminClient();
      expect(admin).toBeDefined();
      expect(typeof admin.from).toBe('function');
    } finally {
      global.window = originalWindow;
    }
  });
});
