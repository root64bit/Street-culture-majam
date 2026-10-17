import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyPage } from '@/components/legal/PolicyPage';

export const metadata: Metadata = {
  title: 'Terms & Conditions | Street Culture',
  description: 'Terms for using Street Culture and purchasing from the online store.',
};

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Store terms"
      title="Clear rules for every order."
      summary="These terms govern use of streetculturevault.com, customer accounts and purchases made through the Street Culture online store."
    >
      <h2>1. The store</h2>
      <p>
        Street Culture is the trading name used for this online store, operated from Maputo,
        Mozambique. By using the website or placing an order, you agree to these terms, our{' '}
        <Link href="/privacy">Privacy Notice</Link> and the policies linked below.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must have legal capacity to enter a purchase contract or act with a parent or guardian.
        Account information must be accurate and kept secure. You are responsible for activity under
        your account unless you report unauthorised access promptly.
      </p>

      <h2>3. Products, condition and authenticity</h2>
      <p>
        We sell curated sneakers, streetwear, luxury fashion and accessories. Items may be new or
        pre-owned; the product page should state the known condition, size and material details.
        Pre-owned items can show disclosed signs of wear. Every item is subject to our inspection
        process, but no description limits your rights if an item is counterfeit, materially
        misdescribed or defective.
      </p>

      <h2>4. Prices and currency</h2>
      <p>
        <strong>All payments are charged in Mozambican meticais (MZN).</strong> Any EUR or ZAR
        display is an estimate for convenience and can change with the exchange rate. The final MZN
        item total, delivery charge and order total are shown before you confirm an order.
      </p>

      <h2>5. Orders and payment</h2>
      <p>
        An order is accepted only after the website confirms it and any required payment is
        verified. Placing an item in a basket does not reserve it. Payment methods are available
        only when shown as active at checkout; a pending, cancelled or failed provider attempt is
        not a completed payment. We may cancel and refund an order affected by a stock error,
        pricing error, suspected fraud or inability to deliver.
      </p>

      <h2>6. Delivery</h2>
      <p>
        Available delivery methods, charges and estimates are shown during checkout. Our{' '}
        <Link href="/shipping">Shipping & Delivery Policy</Link> forms part of these terms. You must
        provide an accurate address and a reachable contact number.
      </p>

      <h2>7. Returns and refunds</h2>
      <p>
        Our <Link href="/returns">Returns & Refund Policy</Link> explains the request, inspection
        and refund process. Nothing in these terms removes a mandatory consumer right that applies
        to your transaction.
      </p>

      <h2>8. Consignment</h2>
      <p>
        Sellers who submit items also agree to the{' '}
        <Link href="/consignment-terms">Consignment & Seller Agreement</Link>. Customer payments are
        accepted for retail orders; Street Culture does not advertise or provide an escrow account
        or customer wallet.
      </p>

      <h2>9. Acceptable use</h2>
      <p>
        Do not misuse the site, attempt unauthorised access, submit false payment or identity
        details, scrape protected content, interfere with service availability, or offer
        counterfeit, stolen or unlawfully obtained goods.
      </p>

      <h2>10. Intellectual property</h2>
      <p>
        The Street Culture name, website design, original photographs and editorial content may not
        be copied or commercially reused without permission. Third-party brand names remain the
        property of their respective owners and do not imply endorsement.
      </p>

      <h2>11. Service availability and liability</h2>
      <p>
        We work to keep product information and the website accurate and available, but temporary
        interruption may occur. To the extent permitted by law, liability is limited to losses that
        are reasonably foreseeable and directly connected to the transaction. We do not exclude
        liability or remedies that cannot legally be excluded.
      </p>

      <h2>12. Questions and disputes</h2>
      <p>
        Contact us first so we can investigate and propose a fair resolution. Applicable mandatory
        consumer law and the jurisdiction rules relevant to the transaction continue to apply. Use
        the <Link href="/contact">contact form</Link> and include the order number where available.
      </p>
    </PolicyPage>
  );
}
