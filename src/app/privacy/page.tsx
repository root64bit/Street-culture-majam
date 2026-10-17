import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyPage } from '@/components/legal/PolicyPage';

export const metadata: Metadata = {
  title: 'Privacy & POPIA Notice | Street Culture',
  description: 'How Street Culture collects, uses, protects and shares personal information.',
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy"
      title="Your information stays part of the trust chain."
      summary="This notice explains what information Street Culture collects, why we use it, who may receive it and how you can exercise your privacy rights."
    >
      <h2>1. Who is responsible for your information</h2>
      <p>
        This website and online store are operated under the trading name{' '}
        <strong>Street Culture</strong>
        from Maputo, Mozambique. For privacy questions or requests, use our{' '}
        <Link href="/contact">contact form</Link> and select “Privacy request.”
      </p>

      <h2>2. Information we collect</h2>
      <ul>
        <li>Account details such as your name, email address and authentication record.</li>
        <li>Order details such as your phone number, delivery address, items and order history.</li>
        <li>
          Consignment details such as item descriptions, photographs, ownership or provenance
          evidence, and identity or payout verification information when required.
        </li>
        <li>
          Payment status, provider reference and transaction metadata. We do not ask you to send us
          a card PIN, password or one-time code.
        </li>
        <li>
          Support messages, returns evidence and records needed to investigate a complaint or
          authenticity concern.
        </li>
        <li>
          Technical information such as IP address, device/browser information, security events,
          cookies and saved currency or basket preferences.
        </li>
      </ul>

      <h2>3. Why we use it</h2>
      <p>
        We use personal information to create and secure accounts, process orders, arrange delivery,
        assess consignments, prevent fraud and counterfeits, provide support, keep financial and
        audit records, comply with lawful requests, and improve the store. We process only what is
        reasonably necessary for these purposes.
      </p>

      <h2>4. Who receives it</h2>
      <p>
        We may share the minimum necessary information with hosting and database providers, approved
        payment processors, delivery partners, authentication or fraud-prevention providers,
        professional advisers and regulators or law-enforcement bodies where legally required. We do
        not sell personal information.
      </p>

      <h2>5. Payments</h2>
      <p>
        Payment methods are available only when shown as active at checkout. A payment provider may
        collect payment information under its own privacy notice. Street Culture receives payment
        status and reference information needed to match a payment to an order.
      </p>

      <h2>6. Cookies and local storage</h2>
      <p>
        Essential browser storage keeps the basket, currency preference, sign-in session and
        security controls working. Where optional analytics or marketing technology is introduced,
        we will provide the notices or choices required by applicable law.
      </p>

      <h2>7. Storage, security and international processing</h2>
      <p>
        We use access controls, encrypted connections and restricted administrative access. Online
        service providers may process information in other countries. When that happens, we require
        appropriate protections and limit the information shared. No online system can promise zero
        risk, so please use a unique password and never share an OTP.
      </p>

      <h2>8. Retention</h2>
      <p>
        We keep order, payment, consignment and support records only for as long as needed to fulfil
        the purpose for which they were collected, resolve disputes, prevent fraud and meet legal,
        tax or accounting requirements. Information that is no longer required is deleted,
        anonymised or securely restricted.
      </p>

      <h2>9. Your choices and rights</h2>
      <p>
        Subject to applicable law, you may ask to access, correct or delete your personal
        information, object to or restrict certain processing, withdraw consent where consent is the
        basis, or complain to the relevant data-protection authority. South African users may also
        contact the Information Regulator. We may need to verify your identity before completing a
        request.
      </p>

      <h2>10. Children</h2>
      <p>
        The store is not intended for children to transact independently. A parent or guardian must
        supervise any purchase or consignment by a person who cannot legally enter the agreement.
      </p>

      <h2>11. Updates and contact</h2>
      <p>
        We may update this notice as the service changes. The date at the top shows the latest
        revision. Submit privacy questions through the{' '}
        <Link href="/contact">secure contact form</Link>.
      </p>
    </PolicyPage>
  );
}
