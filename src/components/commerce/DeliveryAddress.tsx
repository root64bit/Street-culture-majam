import { addressLines } from '@/lib/shipping/address';

export function DeliveryAddress({ address }: { address: Record<string, unknown> }) {
  return (
    <div className="mt-3 text-sm leading-6 text-neutral-700">
      <address className="not-italic">
        {addressLines(address).map((line, index) => (
          <span key={index} className="block">
            {line}
          </span>
        ))}
      </address>
      {typeof address.delivery_notes === 'string' && address.delivery_notes && (
        <p className="mt-3 whitespace-pre-wrap">
          <strong>Delivery instructions:</strong> {address.delivery_notes}
        </p>
      )}
    </div>
  );
}
