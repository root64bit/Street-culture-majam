import { ConfigurationWorkspace } from '@/components/admin/ConfigurationWorkspace';
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  return <ConfigurationWorkspace kind="brand" searchParams={searchParams} />;
}
