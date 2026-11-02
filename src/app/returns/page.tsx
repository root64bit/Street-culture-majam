import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyPage } from '@/components/legal/PolicyPage';

export const metadata: Metadata = {
  title: 'Returns & Refunds | Street Culture',
  description: 'How to request a return, exchange or refund from Street Culture.',
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      eyebrow="Returns"
      title="A fair process when the piece is not right."
      summary="Start here for change-of-mind returns, delivery damage, defects, authenticity concerns and payment corrections."
    >
      <h2>1. Start a return</h2>
      <p>
        Use the <Link href="/contact">contact form</Link>, choose “Return or refund,” and include
        your order number, reason and clear photographs where relevant. Wait for return instructions
        before sending an item so it reaches the correct inspection point.
      </p>

      <h2>2. Change-of-mind returns</h2>
      <p>
        You may request a change-of-mind return within{' '}
        <strong>7 calendar days after delivery</strong>. The item must be unworn and unused, with
        original tags, accessories, packaging and proof of purchase. The customer normally pays
        return delivery for a change-of-mind return. Any longer or different mandatory cooling-off
        right under applicable law will still apply.
      </p>

      <h2>3. Wrong, damaged, defective or misdescribed items</h2>
      <p>
        Contact us promptly if an item is wrong, arrives damaged, is materially different from its
        listing, appears counterfeit or develops a defect. Street Culture will investigate and,
        where the claim is confirmed or law requires it, offer an appropriate repair, replacement or
        refund and cover reasonable return delivery. Mandatory rights, including any applicable
        statutory defect period, are not reduced by this policy.
      </p>

      <h2>4. Pre-owned condition</h2>
      <p>
        Normal wear clearly disclosed in a pre-owned item’s photographs or description is not by
        itself a defect. Undisclosed material damage, a false condition description or an
        authenticity failure remains eligible for investigation and an appropriate remedy.
      </p>

      <h2>5. Inspection</h2>
      <p>
        Returned items are checked against the order, condition record and authentication controls.
        We aim to complete inspection within 3 business days after receipt. We may refuse a
        change-of-mind return that is worn, altered, incomplete or damaged after delivery, unless
        the refusal would conflict with a mandatory consumer right.
      </p>

      <h2>6. Refund timing and method</h2>
      <p>
        Once approved, a refund is initiated to the original payment method where possible, normally
        within 10 business days. The bank or payment provider may require additional processing
        time. Original delivery charges are refunded where required by law or where Street Culture
        sent a wrong, defective or materially misdescribed item.
      </p>

      <h2>7. Hygiene and personalised items</h2>
      <p>
        Opened hygiene-sensitive goods, altered items and made-to-order or personalised products may
        be excluded from change-of-mind returns where the law allows. This does not exclude remedies
        for defects, misdescription or lack of authenticity.
      </p>

      <h2>8. Duplicate or failed payments</h2>
      <p>
        A payment showing as pending is not automatically a completed order. If you believe you were
        charged twice or charged after a failed checkout, contact us with the provider reference and
        order number. Never send a card PIN, password or OTP.
      </p>

      <h2>9. Disputes</h2>
      <p>
        Please contact us first so we can investigate quickly. This request does not remove any
        right to approach a payment provider, consumer body or regulator when appropriate.
      </p>
    </PolicyPage>
  );
}
