import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth }),
}));

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    auth.signInWithPassword.mockReset();
    auth.updateUser.mockReset();
  });

  function fillForm() {
    render(<ChangePasswordForm email="owner@example.com" />);
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'current-pass' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'replacement-pass' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'replacement-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  }

  it('does not update when the current password is wrong', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    fillForm();

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password could not be verified.');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('updates the password only after verifying the current password', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    fillForm();

    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'replacement-pass' }));
    expect(screen.getByRole('status')).toHaveTextContent('Password updated.');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });
});
