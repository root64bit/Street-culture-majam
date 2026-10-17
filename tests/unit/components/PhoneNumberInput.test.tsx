import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneNumberInput } from '@/components/ui/PhoneNumberInput';
import { PhoneVerification } from '@/components/account/PhoneVerification';
import { OtpSignIn } from '@/components/auth/OtpSignIn';

const auth = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }));
const locationResponse = (country: string | null) => ({
  ok: true,
  json: async () => ({ country }),
});
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue([]);
  fetchMock = vi.fn().mockResolvedValue(locationResponse(null));
  vi.stubGlobal('fetch', fetchMock);
  auth.updateUser.mockReset().mockResolvedValue({ error: null });
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ error: { message: 'Test stops before login.' } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function chooseCountry(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /Country \/ calling code/i }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Search country or calling code' }), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name, 'i') }));
}

describe('country-code selector', () => {
  it('suggests a connection country without requesting GPS', async () => {
    fetchMock.mockResolvedValue(locationResponse('ZA'));
    render(<PhoneNumberInput onChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /South Africa \+27/ })).toBeInTheDocument();
    expect(screen.getByText(/suggested from your connection/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/location',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
  it('keeps a saved manual country choice instead of auto-location', async () => {
    localStorage.setItem('street-culture.phone-country', 'PT');
    render(<PhoneNumberInput onChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /Portugal \+351/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('searches by country code and supports keyboard selection', () => {
    const onChange = vi.fn();
    render(<PhoneNumberInput onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Country \/ calling code/ }));
    const search = screen.getByRole('combobox', { name: 'Search country or calling code' });
    fireEvent.change(search, { target: { value: '+351' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /Portugal \+351/ })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '912345678' } });
    expect(onChange).toHaveBeenLastCalledWith('+351912345678');
  });
  it('does not overwrite a manual choice with a late location response', async () => {
    let resolveLocation!: (value: ReturnType<typeof locationResponse>) => void;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLocation = resolve;
      })
    );
    render(<PhoneNumberInput onChange={vi.fn()} />);
    chooseCountry('Portugal');
    await act(async () => {
      resolveLocation(locationResponse('ZA'));
    });
    expect(screen.getByRole('button', { name: /Portugal \+351/ })).toBeInTheDocument();
  });
  it('does not change country after typing has started', async () => {
    let resolveLocation!: (value: ReturnType<typeof locationResponse>) => void;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLocation = resolve;
      })
    );
    render(<PhoneNumberInput onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '841234567' } });
    await act(async () => {
      resolveLocation(locationResponse('ZA'));
    });
    expect(screen.getByRole('button', { name: /Mozambique \+258/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toHaveValue('841234567');
  });
  it('recognizes pasted international numbers and existing verified numbers', () => {
    const onChange = vi.fn();
    render(<PhoneNumberInput initialValue="+14165551234" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Canada \+1/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '+44 7400 123456' },
    });
    expect(screen.getByRole('button', { name: /United Kingdom \+44/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toHaveValue('7400123456');
    expect(onChange).toHaveBeenLastCalledWith('+447400123456');
  });
  it('retains manual entry when approximate location is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('Offline'));
    render(<PhoneNumberInput onChange={vi.fn()} />);
    await act(async () => {});
    chooseCountry('South Africa');
    expect(screen.getByRole('button', { name: /South Africa \+27/ })).toBeInTheDocument();
  });
});

describe('phone verification integration', () => {
  it('sends and verifies the selected international number on the same account', async () => {
    render(<PhoneVerification />);
    chooseCountry('South Africa');
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '0821234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ phone: '+27821234567' }));
    fireEvent.change(await screen.findByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }));
    await waitFor(() =>
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        phone: '+27821234567',
        token: '123456',
        type: 'phone_change',
      })
    );
  });
  it('does not send an incomplete number', async () => {
    render(<PhoneVerification />);
    chooseCountry('South Africa');
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid mobile number');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('uses the same country selector for SMS sign-in, without creating another account', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHONE_OTP_ENABLED', 'true');
    render(<OtpSignIn />);
    fireEvent.click(screen.getByRole('button', { name: 'SMS' }));
    chooseCountry('Portugal');
    fireEvent.change(screen.getByLabelText('Verified mobile number'), {
      target: { value: '912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send SMS code' }));
    await waitFor(() =>
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+351912345678',
        options: { shouldCreateUser: false, channel: 'sms' },
      })
    );
    fireEvent.change(await screen.findByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    await waitFor(() =>
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        phone: '+351912345678',
        token: '123456',
        type: 'sms',
      })
    );
  });
});
