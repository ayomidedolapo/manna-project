import { prisma } from "@/lib/prisma"
import crypto from "crypto"

export const runtime = "nodejs" // important for Prisma + stable webhook behavior

type AnyObj = Record<string, any>

function bad(msg: string, status = 400) {
  return Response.json({ ok: false, error: msg }, { status })
}

/**
 * KWIK docs job statuses:
 * UPCOMING 0, STARTED 1, ENDED 2, FAILED 3, ARRIVED 4,
 * UNASSIGNED 6, ACCEPTED 7, DECLINE 8, CANCEL 9, Deleted 10
 */
function mapKwikStatusToDeliveryStatus(jobStatus: number) {
  switch (jobStatus) {
    case 7: // ACCEPTED
    case 0: // UPCOMING
      return "ASSIGNED"
    case 1: // STARTED
    case 4: // ARRIVED
      return "IN_TRANSIT"
    case 2: // ENDED
      return "DELIVERED"
    case 3: // FAILED
      return "FAILED"
    case 9: // CANCEL
    case 10: // Deleted
      return "CANCELLED"
    case 6: // UNASSIGNED
    case 8: // DECLINE
    default:
      return "CREATED"
  }
}

// ✅ Forward-only guard (prevents status regression)
const DELIVERY_RANK: Record<string, number> = {
  CREATED: 1,
  ASSIGNED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  FAILED: 90,
  CANCELLED: 91,
}

function canMoveForward(current: string, next: string) {
  // terminal states should not be overwritten
  if (current === "DELIVERED" || current === "FAILED" || current === "CANCELLED") return false
  return (DELIVERY_RANK[next] ?? 0) >= (DELIVERY_RANK[current] ?? 0)
}

function extractKwikEvent(payload: AnyObj) {
  const p = payload ?? {}

  const jobId =
    p.job_id ??
    p.jobId ??
    p.data?.job_id ??
    p.data?.jobId ??
    p.job?.job_id ??
    p.job?.jobId ??
    p.data?.deliveries?.[0]?.job_id ??
    p.data?.pickups?.[0]?.job_id ??
    null

  const jobStatusRaw =
    p.job_status ??
    p.jobStatus ??
    p.data?.job_status ??
    p.data?.jobStatus ??
    p.job?.job_status ??
    p.job?.jobStatus ??
    p.data?.deliveries?.[0]?.job_status ??
    p.data?.pickups?.[0]?.job_status ??
    null

  const uniqueOrderId =
    p.unique_order_id ??
    p.uniqueOrderId ??
    p.data?.unique_order_id ??
    p.data?.uniqueOrderId ??
    p.job?.unique_order_id ??
    p.job?.uniqueOrderId ??
    null

  const relationship =
    p.pickup_delivery_relationship ??
    p.relationship ??
    p.data?.pickup_delivery_relationship ??
    p.data?.relationship ??
    null

  const customerId =
    p.customer_id ??
    p.customerId ??
    p.data?.customer_id ??
    p.data?.customerId ??
    null

  const jobStatus = Number(jobStatusRaw)
  const jobIdStr = jobId != null ? String(jobId) : null

  return {
    jobId: jobIdStr,
    jobStatus: Number.isFinite(jobStatus) ? jobStatus : null,
    uniqueOrderId: uniqueOrderId != null ? String(uniqueOrderId) : null,
    relationship: relationship != null ? String(relationship) : null,
    customerId: customerId != null ? String(customerId) : null,
    raw: payload,
  }
}

async function findDeliveryByKwikIdentifiers(args: {
  jobId: string | null
  uniqueOrderId: string | null
}) {
  const { jobId, uniqueOrderId } = args

  // 1) Best: match by kwikTaskId (you store delivery leg job_id in kwikTaskId)
  if (jobId) {
    const byJobId = await prisma.delivery.findFirst({
      where: { kwikTaskId: jobId },
      include: { order: true },
    })
    if (byJobId) return byJobId
  }

  // 2) Fallback: match by kwikRawResponse.data.unique_order_id (JSON query)
  if (uniqueOrderId) {
    const byUniqueOrderId = await prisma.delivery.findFirst({
      where: {
        kwikRawResponse: {
          path: ["data", "unique_order_id"],
          equals: uniqueOrderId,
        },
      },
      include: { order: true },
    })
    if (byUniqueOrderId) return byUniqueOrderId
  }

  return null
}

export async function POST(req: Request) {
  try {
    // ✅ Secret verification
    const secretHeader = req.headers.get("x-kwik-secret")
    const { searchParams } = new URL(req.url)
    const secretQuery = searchParams.get("secret")

    const expected = process.env.KWIK_WEBHOOK_SECRET
    if (!expected) return bad("Server misconfig: missing KWIK_WEBHOOK_SECRET", 500)

    if (secretHeader !== expected && secretQuery !== expected) {
      return bad("Unauthorized webhook", 401)
    }

    const payload = (await req.json().catch(() => null)) as AnyObj | null
    if (!payload) return bad("Invalid JSON body")

    const evt = extractKwikEvent(payload)

    if (evt.jobStatus == null) {
      console.warn("KWIK_WEBHOOK_NO_STATUS:", evt.raw)
      return Response.json({ ok: true, ignored: true, reason: "missing_job_status" })
    }

    // ✅ Create dedupe hash (KWIK can retry same event)
    const dedupeHash = crypto
      .createHash("sha256")
      .update(`${evt.jobId ?? ""}:${evt.jobStatus}:${evt.uniqueOrderId ?? ""}`)
      .digest("hex")

    // If we already processed this exact event, ACK fast
    const existingEvent = await prisma.deliveryWebhookEvent.findUnique({
      where: { dedupeHash },
      select: { id: true, status: true },
    })

    if (existingEvent) {
      return Response.json({ ok: true, deduped: true })
    }

    // Save event first (so we never lose it)
    const savedEvent = await prisma.deliveryWebhookEvent.create({
      data: {
        dedupeHash,
        jobId: evt.jobId,
        uniqueOrderId: evt.uniqueOrderId,
        jobStatus: evt.jobStatus,
        payload: evt.raw,
        status: "RECEIVED",
      },
    })

    const newDeliveryStatus = mapKwikStatusToDeliveryStatus(evt.jobStatus)

    const delivery = await findDeliveryByKwikIdentifiers({
      jobId: evt.jobId,
      uniqueOrderId: evt.uniqueOrderId,
    })

    if (!delivery) {
      console.warn("KWIK_WEBHOOK_NO_MATCH:", {
        jobId: evt.jobId,
        uniqueOrderId: evt.uniqueOrderId,
        jobStatus: evt.jobStatus,
      })

      await prisma.deliveryWebhookEvent.update({
        where: { id: savedEvent.id },
        data: { status: "FAILED", error: "Delivery not found for identifiers" },
      })

      // Still ACK so vendor won't spam retries
      return Response.json({ ok: true, matched: false })
    }

    // ✅ Forward-only: decide whether to apply the new status
    const shouldUpdateStatus =
      delivery.status !== newDeliveryStatus && canMoveForward(delivery.status, newDeliveryStatus)

    // ✅ Transaction for consistency: Delivery + Order + webhook event processed
    const result = await prisma.$transaction(async (tx) => {
      // Always update these “tracking/debug” fields
      const deliveryData: any = {
        kwikJobStatus: evt.jobStatus,
        lastWebhookAt: new Date(),
        kwikUniqueOrderId: evt.uniqueOrderId ?? delivery.kwikUniqueOrderId,
        // Keep latest event snapshot for debugging (optional, but you already do it)
        kwikRawResponse: evt.raw,
      }

      if (shouldUpdateStatus) {
        deliveryData.status = newDeliveryStatus
      }

      const updatedDelivery = await tx.delivery.update({
        where: { id: delivery.id },
        data: deliveryData,
      })

      // ✅ Update order status based on delivery status (only move forward)
      // Rules:
      // - DELIVERED => order DELIVERED
      // - FAILED/CANCELLED => order CANCELLED (your business rule)
      // - ASSIGNED/IN_TRANSIT => order OUT_FOR_DELIVERY (unless already DELIVERED)
      if (newDeliveryStatus === "DELIVERED") {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { status: "DELIVERED" },
        })
      } else if (newDeliveryStatus === "FAILED" || newDeliveryStatus === "CANCELLED") {
        // If you later want manual intervention instead, remove this block.
        if (delivery.order.status !== "DELIVERED") {
          await tx.order.update({
            where: { id: delivery.orderId },
            data: { status: "CANCELLED" },
          })
        }
      } else if (newDeliveryStatus === "ASSIGNED" || newDeliveryStatus === "IN_TRANSIT") {
        if (delivery.order.status !== "DELIVERED") {
          await tx.order.update({
            where: { id: delivery.orderId },
            data: { status: "OUT_FOR_DELIVERY" },
          })
        }
      }

      await tx.deliveryWebhookEvent.update({
        where: { id: savedEvent.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      })

      return updatedDelivery
    })

    return Response.json({
      ok: true,
      deliveryId: result.id,
      orderId: delivery.orderId,
      jobId: evt.jobId,
      uniqueOrderId: evt.uniqueOrderId,
      jobStatus: evt.jobStatus,
      mappedStatus: shouldUpdateStatus ? newDeliveryStatus : delivery.status,
      note: shouldUpdateStatus ? undefined : "ignored_backward_or_terminal_transition",
    })
  } catch (err) {
    console.error("KWIK_WEBHOOK_ERROR:", err)
    // Return 200 so KWIK doesn't hammer you with retries during debugging
    return Response.json({ ok: true, error: "webhook_error_handled" })
  }
}
