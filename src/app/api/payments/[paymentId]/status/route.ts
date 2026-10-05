import { POST } from '@/app/api/payments/mpesa/status/route';

export async function GET(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const orderId = new URL(request.url).searchParams.get('orderId');
  return POST(new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ order_id: orderId, payment_id: paymentId }),
  }));
}
