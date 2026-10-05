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

// No email/SMS vendor has been approved. This provider records intent only in
// local development and never claims delivery to a customer.
export const notificationProvider: NotificationProvider = {
  async dispatch(notification) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[notification:development-only]', notification.kind, notification.recordId);
    }
    return { delivered: false };
  },
};
