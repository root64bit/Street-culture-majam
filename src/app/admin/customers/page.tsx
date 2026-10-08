import { AccountDirectory } from '@/components/admin/AccountDirectory';
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  return <AccountDirectory kind="customer" searchParams={searchParams} />;
}
