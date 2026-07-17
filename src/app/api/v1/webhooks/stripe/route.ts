import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { jsonOk } from '@/lib/api-error';

export const runtime = 'nodejs';
// Body 를 raw 로 받아 서명 검증하려면 dynamic + 자체 파싱 필요.
export const dynamic = 'force-dynamic';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 설정되지 않았습니다.`);
  return v;
}

// 서명 검증에는 서버 시크릿과 요청 본문의 raw 바이트가 필요.
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'signature missing' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text(); // ✅ raw 문자열 (Stripe 요구)
  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] signature verify failed', err);
    return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'signature verify failed' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Idempotency: 이미 처리한 이벤트면 조용히 200.
  const existing = await db.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing) return jsonOk({ received: true, duplicate: true });

  // 실제 처리는 이벤트 타입별 handler 로 분기 (여기선 스텁).
  // API 명세 §15 표 참고: invoice.payment_succeeded, customer.subscription.deleted, ...
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'customer.subscription.created':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
    case 'customer.subscription.deleted':
    case 'charge.refunded':
    case 'payout.paid':
    case 'payout.failed':
      // TODO: 각 이벤트에 대한 DB 반영
      break;
    default:
      // 처리 안하는 이벤트는 그냥 통과 (Stripe 재시도 방지 위해 200)
      break;
  }

  await db.stripeEvent.create({
    data: { id: event.id, type: event.type, payload: event as unknown as object },
  });

  return jsonOk({ received: true });
}
