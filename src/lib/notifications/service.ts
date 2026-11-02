import 'server-only';

export type TransactionalNotificationKind =
  | 'ORDER_CONFIRMED'
  | 'PAYMENT_CONFIRMED'
  | 'ORDER_SHIPPED'
  | 'CONSIGNMENT_RECEIVED'
  | 'CONSIGNMENT_AUTHENTICATED'
  | 'CONSIGNMENT_SOLD'
  | 'PAYOUT_PROCESSED';

export interface TransactionalNotification {
  kind: TransactionalNotificationKind;
  recordId: string;
}

export interface NotificationProvider {
  dispatch(notification: TransactionalNotification): Promise<{ delivered: boolean }>;
}

// Order email intents are created transactionally by the order outbox trigger.
// Delivery is a separate opt-in worker; this legacy interface never sends or
// claims delivery during payment finalization.
export const notificationProvider: NotificationProvider = {
  async dispatch(notification) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[notification:development-only]', notification.kind, notification.recordId);
    }
    return { delivered: false };
  },
};
