export const orderEventLabels: Record<string, string> = {
  ORDER_CREATED: 'Order placed',
  LISTING_RESERVED: 'Piece reserved',
  PAYMENT_INITIATED: 'M-Pesa request sent',
  PAYMENT_CONFIRMED: 'Payment received',
  ORDER_CONFIRMED: 'Order confirmed',
  PAYMENT_FAILED: 'Payment declined',
  RESERVATION_EXPIRED: 'Reservation expired',
  PAID_ORDER_REQUIRES_REVIEW: 'Our team is reviewing your payment',
  ORDER_PROCESSING: 'Preparing your order',
  ORDER_PACKED: 'Packed and ready',
  ORDER_SHIPPED: 'Order shipped',
  ORDER_DELIVERED: 'Order delivered',
};

export const consignmentLabels: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  MORE_INFORMATION_REQUIRED: 'More information needed',
  APPROVED_FOR_DELIVERY: 'Approved',
  REJECTED: 'Not approved',
  AWAITING_ITEM: 'Awaiting your item',
  IN_TRANSIT: 'On its way to us',
  RECEIVED: 'Item received',
  AUTHENTICATION_PENDING: 'Authentication queued',
  AUTHENTICATION_IN_PROGRESS: 'Authentication in progress',
  AUTHENTICATED: 'Authenticated',
  AUTHENTICATION_FAILED: 'Authentication unsuccessful',
  PHOTOGRAPHY: 'Being photographed',
  PRICING: 'Pricing',
  READY_TO_LIST: 'Ready to list',
  LISTED: 'Listed for sale',
  RESERVED: 'Reserved by a buyer',
  SOLD: 'Sold · payout pending',
  PAYOUT_PENDING: 'Payout pending',
  PAID: 'Paid',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
};

export function readableOrderStatus(status: string, paymentStatus: string) {
  if (paymentStatus === 'PAID' && status === 'CANCELLED') return 'Payment under review';
  if (status === 'PENDING') return 'Awaiting payment';
  return status.charAt(0) + status.slice(1).toLowerCase();
}
