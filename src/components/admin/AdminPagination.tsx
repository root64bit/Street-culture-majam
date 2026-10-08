import Link from 'next/link';

export function AdminPagination({
  basePath,
  page,
  count,
  pageSize,
  filters = {},
}: {
  basePath: string;
  page: number;
  count: number;
  pageSize: number;
  filters?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const href = (target: number) => {
    const params = new URLSearchParams(filters);
    params.set('page', String(target));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7eee8] px-5 py-4 text-xs text-[#61766b]">
      <span>
        {count === 0
          ? 'No records'
          : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="rounded-lg border border-[#dce6dc] px-3 py-2 font-bold text-[#173829] hover:bg-[#f2f8f2]"
          >
            Previous
          </Link>
        )}
        <span className="px-2">
          Page {page} of {pages}
        </span>
        {page < pages && (
          <Link
            href={href(page + 1)}
            className="rounded-lg border border-[#dce6dc] px-3 py-2 font-bold text-[#173829] hover:bg-[#f2f8f2]"
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
