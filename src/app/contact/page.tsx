import type { Metadata } from 'next';
import { Clock3, LockKeyhole, MapPin, MessageCircle } from 'lucide-react';
import { ContactForm } from '@/components/contact/ContactForm';
import { supportDetails, whatsappHref } from '@/lib/storefront/business';

export const metadata: Metadata = {
  title: 'Contact Street Culture',
  description: 'Contact Street Culture about an order, return, consignment or privacy request.',
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#f5f2ea] px-4 pb-24 pt-32 text-[#10211a] sm:px-6 sm:pt-36">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[2rem] bg-[#0d211a] p-7 text-white sm:p-10">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-acid">Contact</p>
          <h1 className="mt-5 text-5xl font-black leading-[0.92] tracking-[-0.06em]">
            Tell us what needs attention.
          </h1>
          <p className="mt-6 text-sm leading-7 text-white/65">
            This secure form is Street Culture’s official support channel for orders, returns,
            consignments, authenticity concerns and privacy requests.
          </p>
          <div className="mt-10 space-y-5 border-t border-white/10 pt-8 text-sm">
            {supportDetails.whatsapp && (
              <a
                href={whatsappHref() || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 transition-colors hover:text-acid"
              >
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-acid" />
                <span>
                  <strong className="block">WhatsApp support</strong>
                  <span className="text-white/75">{supportDetails.whatsappLabel}</span>
                </span>
              </a>
            )}
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-acid" />
              <span>
                <strong className="block text-white">Operating location</strong>
                <span className="text-white/55">Maputo, Mozambique</span>
              </span>
            </div>
            <div className="flex gap-3">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-acid" />
              <span>
                <strong className="block text-white">Response target</strong>
                <span className="text-white/55">Within 2 business days</span>
              </span>
            </div>
            <div className="flex gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-acid" />
              <span>
                <strong className="block text-white">Account safety</strong>
                <span className="text-white/55">We never ask for a password, PIN or OTP.</span>
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-[0_18px_60px_rgba(13,33,26,0.06)] sm:p-10">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/40">
            Support request
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]">Send the details</h2>
          <p className="mb-8 mt-3 text-sm leading-6 text-black/55">
            Include your order or consignment reference when you have one. Your message is routed to
            authorised Street Culture staff in the operations console.
          </p>
          <ContactForm />
        </section>
      </div>
    </main>
  );
}
