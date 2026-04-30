import { prisma } from "@/lib/prisma"
import type { Prisma, DeliveryStatus } from "@prisma/client"

function mapStatus(code: number): DeliveryStatus {
  switch (code) {
    case 0:
      return "CREATED"
    case 7:
      return "ASSIGNED"
    case 1:
      return "PICKED_UP"
    case 2:
      return "DELIVERED"
    case 3:
      return "FAILED"
    case 9:
      return "CANCELLED"
    default:
      return "IN_TRANSIT"
  }
}

interface KwikWebhookPayload {
  task_id?: string | number
  status?: number
  [key: string]: unknown
}

export async function handleKwikWebhook(payload: KwikWebhookPayload) {
  const taskId = payload?.task_id
  const statusCode = payload?.status

  if (taskId == null) return

  const delivery = await prisma.delivery.findUnique({
    where: { kwikTaskId: String(taskId) },
  })

  if (!delivery) return

  const newStatus = mapStatus(Number(statusCode))

  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      status: newStatus,
      kwikRawResponse: payload as unknown as Prisma.InputJsonValue,
    },
  })

  if (newStatus === "DELIVERED") {
    await prisma.order.update({
      where: { id: delivery.orderId },
      data: { status: "DELIVERED" },
    })
  }

  if (newStatus === "FAILED" || newStatus === "CANCELLED") {
    await prisma.order.update({
      where: { id: delivery.orderId },
      data: { status: "PROCESSING" }, // fallback (re-dispatch)
    })
  }
}
