'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const staffRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATIONS',
  'CATALOG_MANAGER',
  'AUTHENTICATOR',
  'FULFILLMENT',
  'FINANCE',
  'SUPPORT',
  'STAFF',
] as const;

export function StaffRoleForm({
  userId,
  currentRoles,
}: {
  userId?: string;
  currentRoles: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState(userId ?? '');
  const [grant, setGrant] = useState(true);
  const [role, setRole] = useState<string>(
    staffRoles.find((item) => !currentRoles.includes(item)) ?? 'STAFF'
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choices = staffRoles.filter((item) =>
    grant ? !currentRoles.includes(item) : currentRoles.includes(item)
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetId, role, grant, reason }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) setError(body.error ?? 'Role change failed.');
      else {
        setOpen(false);
        setReason('');
        router.refresh();
      }
    } catch {
      setError('Role change failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-[#cbded0] px-3 py-2 text-[11px] font-bold text-[#126347]"
      >
        {open ? 'Close' : userId ? 'Manage roles' : 'Add staff role'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-[#eff7eb] p-3">
          {!userId && (
            <label className="block text-[11px] font-bold">
              Existing account UUID
              <input
                required
                pattern="[0-9a-fA-F-]{36}"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 font-mono text-xs"
              />
            </label>
          )}
          <label className="block text-[11px] font-bold">
            Action
            <select
              value={grant ? 'grant' : 'revoke'}
              onChange={(event) => {
                const nextGrant = event.target.value === 'grant';
                setGrant(nextGrant);
                setRole(
                  staffRoles.find((item) =>
                    nextGrant ? !currentRoles.includes(item) : currentRoles.includes(item)
                  ) ?? ''
                );
              }}
              className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 text-xs"
            >
              <option value="grant">Grant role</option>
              {userId && <option value="revoke">Revoke role</option>}
            </select>
          </label>
          <label className="block text-[11px] font-bold">
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 text-xs"
            >
              {choices.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-bold">
            Reason
            <textarea
              required
              minLength={10}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 text-xs"
            />
          </label>
          {role === 'SUPER_ADMIN' && (
            <p className="text-[11px] font-semibold text-[#9d482c]">
              This role controls staff permissions and finance operations. Verify the account ID.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[11px] text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy || reason.trim().length < 10 || !role || targetId.length !== 36}
            className="rounded bg-[#0d211a] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : grant ? 'Grant audited role' : 'Revoke audited role'}
          </button>
        </form>
      )}
    </div>
  );
}
