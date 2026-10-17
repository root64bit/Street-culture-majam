import { Mail, MessageSquareText, Phone } from 'lucide-react';
import { requireCapabilitiesPage } from '@/lib/admin/access';

type ContactMetadata = {
  email?: string | null;
  phone?: string | null;
  order_number?: string | null;
  topic?: string | null;
  submitted_at?: string | null;
};

export default async function ContactRequestsPage() {
  const { supabase } = await requireCapabilitiesPage('/admin/contact', ['customers.read']);
  const { data, error } = await supabase
    .from('notifications')
    .select('id,title,body,metadata,created_at')
    .eq('type', 'CONTACT_REQUEST')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (
    <main className="p-4 sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6f8379]">
            Customer care
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.045em]">Contact requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64766d]">
            Messages submitted through the public support form. Treat contact and order details as
            confidential.
          </p>
        </div>
        <div className="rounded-full border border-[#dce5df] bg-white px-4 py-2 text-xs font-bold text-[#53675d]">
          {data?.length ?? 0} latest requests
        </div>
      </div>

      {!data?.length ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#cfdad3] bg-white p-12 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-[#789086]" />
          <p className="mt-4 text-sm font-bold">No contact requests yet</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          {data.map((request) => {
            const metadata = (request.metadata ?? {}) as ContactMetadata;
            return (
              <article
                key={request.id}
                className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full bg-[#ecf7f1] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#087456]">
                    {metadata.topic?.replaceAll('_', ' ') || 'Support'}
                  </span>
                  <time className="text-xs text-[#75877e]" dateTime={request.created_at}>
                    {new Intl.DateTimeFormat('en-ZA', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(request.created_at))}
                  </time>
                </div>
                <h2 className="mt-4 text-lg font-black tracking-[-0.025em]">{request.title}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#53675d]">
                  {request.body}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-[#edf1ee] pt-4 text-xs">
                  {metadata.email && (
                    <a
                      href={`mailto:${metadata.email}`}
                      className="inline-flex items-center gap-2 rounded-full bg-[#f3f5f3] px-3 py-2 font-semibold"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {metadata.email}
                    </a>
                  )}
                  {metadata.phone && (
                    <a
                      href={`tel:${metadata.phone}`}
                      className="inline-flex items-center gap-2 rounded-full bg-[#f3f5f3] px-3 py-2 font-semibold"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {metadata.phone}
                    </a>
                  )}
                  {metadata.order_number && (
                    <span className="rounded-full bg-[#f3f5f3] px-3 py-2 font-mono font-semibold">
                      Order {metadata.order_number}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
