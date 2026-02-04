import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { DiscountType, Prisma } from "@prisma/client"

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params
    const body = await req.json()

    const updates: Partial<{
      title: string
      description: string | null
      type: DiscountType
      percentageOff: number | null
      fixedAmountOff: number | null
      appliesToAll: boolean
      productIds: string[] | null
      startsAt: Date | null
      endsAt: Date | null
    }> = {}

    if (body.title !== undefined) updates.title = String(body.title)
    if (body.description !== undefined)
      updates.description = body.description ? String(body.description) : null

    if (body.type !== undefined) {
      const t = String(body.type)
      if (!Object.values(DiscountType).includes(t as DiscountType)) {
        return NextResponse.json(
          { message: `type must be one of: ${Object.values(DiscountType).join(", ")}` },
          { status: 400 }
        )
      }
      updates.type = t as DiscountType

      // Clear old fields; new ones must be provided accordingly
      updates.percentageOff = null
      updates.fixedAmountOff = null
    }

    if (body.percentageOff !== undefined) {
      const pct = Number(body.percentageOff)
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json(
          { message: "percentageOff must be between 1 and 100" },
          { status: 400 }
        )
      }
      updates.percentageOff = Math.floor(pct)
    }

    if (body.fixedAmountOff !== undefined) {
      const amt = Number(body.fixedAmountOff)
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json(
          { message: "fixedAmountOff must be a positive number" },
          { status: 400 }
        )
      }
      updates.fixedAmountOff = Math.floor(amt)
    }

    if (body.appliesToAll !== undefined) {
      updates.appliesToAll = Boolean(body.appliesToAll)
      if (updates.appliesToAll) updates.productIds = null
    }

    if (body.productIds !== undefined) {
      if (!Array.isArray(body.productIds) && body.productIds !== null) {
        return NextResponse.json(
          { message: "productIds must be an array or null" },
          { status: 400 }
        )
      }
      updates.productIds = body.productIds
    }

    if (body.startsAt !== undefined) {
      updates.startsAt = body.startsAt ? new Date(body.startsAt) : null
      if (updates.startsAt && isNaN(updates.startsAt.getTime())) {
        return NextResponse.json({ message: "startsAt is invalid" }, { status: 400 })
      }
    }

    if (body.endsAt !== undefined) {
      updates.endsAt = body.endsAt ? new Date(body.endsAt) : null
      if (updates.endsAt && isNaN(updates.endsAt.getTime())) {
        return NextResponse.json({ message: "endsAt is invalid" }, { status: 400 })
      }
    }

    // If both provided, validate ordering
    if (updates.startsAt && updates.endsAt && updates.endsAt <= updates.startsAt) {
      return NextResponse.json(
        { message: "endsAt must be after startsAt" },
        { status: 400 }
      )
    }

    // Prepare data for Prisma, converting null productIds to Prisma.JsonNull
    const data: Prisma.DiscountUpdateInput = { ...updates } as Prisma.DiscountUpdateInput
    if (updates.productIds !== undefined) {
      data.productIds = updates.productIds === null ? Prisma.JsonNull : (updates.productIds as Prisma.InputJsonValue)
    }

    const discount = await prisma.discount.update({
      where: { id },
      data,
    })

    return NextResponse.json({ discount })
  } catch (e) {
    console.error("ADMIN_UPDATE_DISCOUNT_ERROR", e)
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 })
  }
}
