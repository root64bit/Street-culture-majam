export function safeCourierTrackingUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      [
        'internetexpress.co.za',
        'www.internetexpress.co.za',
        'portal.internetexpress.co.za',
      ].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export const shipmentLabels: Record<string, string> = {
  REVIEW: 'Awaiting fulfillment review',
  READY: 'Packed and reviewed · not yet booked',
  BOOKING_PENDING: 'Courier booking in progress',
  BOOKING_UNKNOWN: 'Our team is checking courier confirmation',
  BOOKED: 'Courier booked · awaiting collection',
  AWAITING_COLLECTION: 'Awaiting courier collection',
  COLLECTED: 'Handed to courier',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Delivery issue under review',
  CANCELLED: 'Shipment cancelled',
};
