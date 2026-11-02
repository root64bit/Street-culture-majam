import { ConfigurationWorkspace } from '@/components/admin/ConfigurationWorkspace';
import { InternetExpressPanel } from '@/components/admin/InternetExpressPanel';
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  return (
    <>
      <InternetExpressPanel />
      <ConfigurationWorkspace kind="shipping" searchParams={searchParams} />
    </>
  );
}
