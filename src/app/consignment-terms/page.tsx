import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyPage } from '@/components/legal/PolicyPage';

export const metadata: Metadata = {
  title: 'Consignment & Seller Agreement | Street Culture',
  description: 'The terms for submitting and selling an item through Street Culture.',
};

export default function ConsignmentTermsPage() {
  return (
    <PolicyPage
      eyebrow="Seller agreement"
      title="A documented route from intake to payout."
      summary="These terms apply when a seller submits an item for Street Culture to inspect, list and sell on consignment."
    >
      <h2>1. Agreement and eligibility</h2>
      <p>
        By submitting an item, you ask Street Culture to assess it for consignment and agree to
        these terms. You must be legally able to enter the agreement and provide accurate contact,
        identity and payout information when requested.
      </p>

      <h2>2. Ownership and lawful goods</h2>
      <p>
        You confirm that you own the item or are authorised to sell it, and that it is not
        counterfeit, stolen, encumbered, subject to another sale, or obtained unlawfully. You must
        disclose repairs, alterations, damage and any fact that affects authenticity, condition or
        value.
      </p>

      <h2>3. Intake, KYC and verification</h2>
      <p>
        We may request your full name, contact details, government-issued identity evidence, proof
        of address, ownership or provenance evidence, and proof that a payout account belongs to
        you. We may compare those details for consistency and screen for fraud or other risk. An
        item will not be listed or paid out until required checks are complete.
      </p>

      <h2>4. Authentication and acceptance</h2>
      <p>
        Submission does not guarantee acceptance. We inspect condition, identifiers, construction,
        packaging and provenance evidence appropriate to the item. We may reject an item that fails
        authentication, is unsafe, is not commercially suitable or does not match the submission.
        Rejected items are returned using agreed instructions and may be reported where law
        requires.
      </p>

      <h2>5. Listing price and authority to sell</h2>
      <p>
        The proposed selling price is based on the seller’s expectation, item condition and market
        assessment. The final listing price and any material price change must be communicated to or
        recorded for the seller before sale. Once listed, you authorise Street Culture to present
        and sell the item under the agreed terms.
      </p>

      <h2>6. Commission</h2>
      <p>
        Street Culture’s standard commission is <strong>30% of the accepted item sale price</strong>
        , and the seller share is 70%. Delivery charges, taxes, agreed repair costs or other
        deductions are not taken from the seller share unless disclosed and agreed or required to
        resolve a valid return, refund, chargeback or legal claim.
      </p>

      <h2>7. Customer payment and payout</h2>
      <p>
        The buyer pays Street Culture for a retail order. This is not described as an escrow
        service, deposit account or customer wallet. The seller’s share becomes eligible for payout
        only after confirmed delivery and the applicable return review period, normally 7 calendar
        days, with no active refund, authenticity dispute, fraud review or chargeback. An authorised
        Street Culture team member reviews and releases the payout; release is not controlled by the
        buyer.
      </p>

      <h2>8. Where money is held</h2>
      <p>
        Before seller payout, collected order funds remain in Street Culture’s approved merchant or
        settlement account with the payment provider or financial institution. They are not held in
        a separate buyer-controlled escrow account. Payout records include the amount, approval and
        external payment reference where available.
      </p>

      <h2>9. Returns, disputes and chargebacks</h2>
      <p>
        We investigate customer complaints using the listing, intake record, photographs,
        authentication notes and delivery evidence. A payout may be paused while a claim is open. If
        a completed payout is affected by a confirmed counterfeit item, material seller
        misrepresentation or valid chargeback, the seller must cooperate and may be required to
        repay the documented loss to the extent permitted by law.
      </p>

      <h2>10. Unsold items and withdrawal</h2>
      <p>
        A seller may request withdrawal before a sale, subject to any disclosed costs already
        approved. Street Culture may end a listing for authenticity, safety, legal, pricing or
        operational reasons. Collection or return arrangements must be completed within the period
        stated in our message to the seller.
      </p>

      <h2>11. Care of items</h2>
      <p>
        We take reasonable care of accepted items and document handovers. Risk and responsibility
        are assessed using the intake and custody record if loss or damage occurs while the item is
        under our control. We are not responsible for undisclosed weakness, deterioration inherent
        to age or damage caused by unsuitable packaging supplied by the seller.
      </p>

      <h2>12. Privacy and contact</h2>
      <p>
        Seller information is handled under our <Link href="/privacy">Privacy Notice</Link>.
        Questions, payout issues and disputes should be submitted through the{' '}
        <Link href="/contact">contact form</Link> with the consignment reference.
      </p>
    </PolicyPage>
  );
}
