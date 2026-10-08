import { AccountDetail } from '@/components/admin/AccountDetail';
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AccountDetail kind="customer" params={params} />;
}
