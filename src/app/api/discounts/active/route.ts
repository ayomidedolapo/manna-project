import { NextResponse } from "next/server"
import { getActiveDiscounts } from "@/services/discount.service"

export async function GET() {
  try {
    const [discount] = await getActiveDiscounts()

    return NextResponse.json({
      active: !!discount,
      discount: discount
        ? {
            id: discount.id,
            title: discount.title,
            description: discount.description,
            type: discount.type,
            percentageOff: discount.percentageOff,
            fixedAmountOff: discount.fixedAmountOff,
            appliesToAll: discount.appliesToAll,
            productIds: discount.productIds,
            startsAt: discount.startsAt,
            endsAt: discount.endsAt,
          }
        : null,
    })
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : String(e ?? "Failed to fetch active discount")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
