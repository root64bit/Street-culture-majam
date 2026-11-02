// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  path: '/admin/orders/private-id',
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-street-culture-path': mocks.path }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error('REDIRECT:' + path);
  },
}));
import { capabilityApiClient, requireCapabilitiesPage } from '@/lib/admin/access';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'current-user' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.path = '/admin/orders/private-id';
});
describe('private page access experience', () => {
  it('sends an unauthorized account to helpful access guidance, preserving the deep link', async () => {
    await expect(requireCapabilitiesPage('/admin', ['dashboard.read'])).rejects.toThrow(
      'REDIRECT:/auth/access?area=staff&redirectTo=%2Fadmin%2Forders%2Fprivate-id'
    );
  });
  it('keeps APIs forbidden rather than granting access or returning HTML', async () =>
    expect(await capabilityApiClient(['orders.read'])).toEqual({
      error: 'This role cannot perform that action.',
      status: 403,
    }));
  it('keeps signed-out users in the normal sign-in flow', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      requireCapabilitiesPage('/admin/orders/private-id', ['orders.read'])
    ).rejects.toThrow('REDIRECT:/auth/sign-in?redirectTo=%2Fadmin%2Forders%2Fprivate-id');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not treat access-check outages as an account mismatch', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Database unavailable' } });
    await expect(requireCapabilitiesPage('/admin', ['dashboard.read'])).rejects.toThrow(
      'Access checks are temporarily unavailable'
    );
  });
  it('never turns a navigation hint into an external redirect', async () => {
    mocks.path = 'https://attacker.invalid';
    await expect(requireCapabilitiesPage('/admin', ['dashboard.read'])).rejects.toThrow(
      'redirectTo=%2Fadmin'
    );
  });
});
