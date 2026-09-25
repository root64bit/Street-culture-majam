export * from '@/lib/schemas/auth.schema';

export interface AuthSession {
  userId: string;
  email: string;
  role: string;
}
