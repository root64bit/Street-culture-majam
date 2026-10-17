import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyPage } from '@/components/legal/PolicyPage';

export const metadata: Metadata = {
  title: 'Shipping & Delivery | Street Culture',
  description: 'Delivery areas, charges, timing and responsibilities for Street Culture orders.',
};

export default function ShippingPage() {
  return (
    <PolicyPage
      eyebrow="Delivery"
      title="From verification to your door."
      summary="This policy explains when an order is dispatched, how delivery charges and estimates work, and what to do if something goes wrong."
    >
      <h2>1. Where we deliver</h2>
      <p>
        Available destinations are determined by the delivery options offered at checkout. We
        primarily operate from Maputo, Mozambique, while Internet Express courier collections use
        the fulfilment address saved on our courier account in Johannesburg, South Africa. If no
        delivery method is offered for an address, the order cannot be completed online for that
        destination. Cross-border delivery is available only when specifically offered.
      </p>

      <h2>2. Delivery charges and currency</h2>
      <p>
        Internet Express provides the live courier price using the destination and packed parcel
        details. The ZAR courier price is converted to <strong>MZN</strong> using the current daily
        exchange rate and shown before order confirmation. Any other displayed currency is an
        estimate only. Customs duties, import taxes and destination handling fees are not included
        unless checkout expressly says otherwise.
      </p>

      <h2>3. Processing and dispatch</h2>
      <p>
        Processing begins after payment has been confirmed and stock has passed the required final
        check. Dispatch and delivery estimates appear at checkout or in the order update. Estimates
        are not guarantees and can be affected by weekends, public holidays, weather, courier
        delays, address problems or additional authenticity checks.
      </p>

      <h2>4. Address and handover</h2>
      <p>
        Provide a complete address and reachable phone number. Contact us immediately if a
        correction is needed; we cannot guarantee a change after dispatch. A courier may require the
        recipient’s name, signature, delivery code or other reasonable proof of handover.
      </p>

      <h2>5. Tracking and collection</h2>
      <p>
        Where tracking is available, the reference is provided with the order update. If collection
        is offered, the collection instructions and verification requirements will be confirmed
        directly. Do not travel to collect until you receive confirmation that the item is ready.
      </p>

      <h2>6. Delayed, lost or damaged orders</h2>
      <p>
        If tracking is stalled, the parcel appears lost, or the package arrives damaged, submit a{' '}
        <Link href="/contact">support request</Link> as soon as possible with the order number and
        clear photographs where relevant. Reporting visible transit damage within 48 hours helps us
        preserve courier evidence, but this guideline does not remove mandatory consumer rights.
      </p>

      <h2>7. Failed delivery</h2>
      <p>
        If delivery fails because the address is wrong, nobody is available, or the parcel is not
        collected, a reasonable re-delivery or return charge may apply. We will explain the
        available option before charging it.
      </p>

      <h2>8. Cross-border taxes</h2>
      <p>
        For an expressly offered cross-border shipment, customs duties, import taxes or clearance
        fees may apply. Checkout or delivery information will state whether these are included.
        Where they are not included, the recipient is responsible for them.
      </p>
    </PolicyPage>
  );
}
