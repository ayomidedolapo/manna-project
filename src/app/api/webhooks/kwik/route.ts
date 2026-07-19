import { NextResponse, type NextRequest } from "next/server";
import {
  extractNumberFromKwikPayload,
  extractStringFromKwikPayload,
  parseKwikWebhookBody,
} from "@/lib/kwik/webhookPayload";
import {
  markKwikWebhookReceived,
  syncKwikDeliveryStatusByUniqueOrderId,
} from "@/lib/kwik/statusSync";

function hasValidWebhookSecret(req: NextRequest): boolean {
  const configuredSecret = process.env.KWIK_WEBHOOK_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const headerSecret =
    req.headers.get("x-kwik-webhook-secret") ??
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-manna-webhook-secret");

  return headerSecret === configuredSecret;
}

export async function POST(req: NextRequest) {
  if (!hasValidWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.text();
  const payload = parseKwikWebhookBody(rawBody);

  const uniqueOrderId = extractStringFromKwikPayload(payload, [
    "unique_order_id",
    "uniqueOrderId",
    "order_id",
    "orderId",
  ]);

  const jobId = extractStringFromKwikPayload(payload, ["job_id", "jobId"]);
  const jobStatus = extractNumberFromKwikPayload(payload, [
    "job_status",
    "jobStatus",
    "status",
  ]);

  await markKwikWebhookReceived(payload, uniqueOrderId, jobId, jobStatus);

  if (!uniqueOrderId) {
    return NextResponse.json({
      ok: true,
      received: true,
      processed: false,
      reason: "Webhook did not contain a Kwik unique order ID.",
    });
  }

  try {
    const result = await syncKwikDeliveryStatusByUniqueOrderId(uniqueOrderId);

    return NextResponse.json({
      ok: true,
      received: true,
      processed: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        received: true,
        processed: false,
        error: error instanceof Error ? error.message : "Kwik webhook processing failed.",
      },
      { status: 202 }
    );
  }
}
