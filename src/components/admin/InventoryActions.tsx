import { AdminActionForm } from '@/components/admin/AdminActionForm';
export function InventoryActions({
  id,
  status,
  authenticationStatus,
}: {
  id: string;
  status: string;
  authenticationStatus: string;
}) {
  const actions: { value: string; label: string }[] = [];
  if (status === 'LIVE')
    actions.push({ value: 'DEACTIVATE', label: 'Deactivate (hide from storefront)' });
  if (status === 'DRAFT' || status === 'APPROVED') {
    if (authenticationStatus === 'PASSED')
      actions.push({ value: 'ACTIVATE', label: 'Activate authenticated unit' });
    actions.push({ value: 'ARCHIVE', label: 'Archive available unit' });
  }
  if (status === 'ARCHIVED')
    actions.push({ value: 'RESTORE_DRAFT', label: 'Restore as unpublished draft' });
  if (status === 'RESERVED')
    actions.push({ value: 'RELEASE_EXPIRED', label: 'Release only if expired and unpaid' });
  return (
    <div className="min-w-[230px] space-y-3">
      {actions.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold text-[#126347]">
            Change status
          </summary>
          <div className="mt-2">
            <AdminActionForm endpoint={`/api/admin/listings/${id}/operations`} actions={actions} />
          </div>
        </details>
      )}
      {['LIVE', 'DRAFT', 'APPROVED'].includes(status) && (
        <details>
          <summary className="cursor-pointer text-xs font-bold text-[#126347]">
            Adjust price
          </summary>
          <div className="mt-2">
            <AdminActionForm
              endpoint={`/api/admin/listings/${id}/operations`}
              actions={[{ value: 'ADJUST_PRICE', label: 'Change asking price' }]}
              fields={[
                {
                  name: 'price',
                  label: 'New asking price (MZN)',
                  type: 'number',
                  step: '0.01',
                  required: true,
                },
              ]}
            />
          </div>
        </details>
      )}
    </div>
  );
}
