import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { DiscountType } from "@prisma/client"

export async function GET() {
  const discounts = await prisma.discount.findMany({
    orderBy: [{ createdAt: "desc" }],
  })

  return NextResponse.json({ discounts })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      title,
      description,
      type,
      percentageOff,
      fixedAmountOff,
      appliesToAll = false,
      productIds,
      isActive = false,
      startsAt,
      endsAt,
    } = body

    if (!title || !type) {
      return NextResponse.json(
        { message: "title and type are required" },
        { status: 400 }
      )
    }

    if (!Object.values(DiscountType).includes(String(type) as DiscountType)) {
      return NextResponse.json(
        { message: `type must be one of: ${Object.values(DiscountType).join(", ")}` },
        { status: 400 }
      )
    }

    const t = String(type) as DiscountType

    // validate discount value
    if (t === "PERCENTAGE") {
      const pct = Number(percentageOff)
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json(
          { message: "percentageOff must be between 1 and 100 for PERCENTAGE discounts" },
          { status: 400 }
        )
      }
    }

    if (t === "FIXED") {
      const amt = Number(fixedAmountOff)
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json(
          { message: "fixedAmountOff must be a positive number for FIXED discounts" },
          { status: 400 }
        )
      }
    }

    // validate schedule (optional)
    const starts = startsAt ? new Date(startsAt) : null
    const ends = endsAt ? new Date(endsAt) : null

    if (starts && isNaN(starts.getTime())) {
      return NextResponse.json({ message: "startsAt is invalid" }, { status: 400 })
    }
    if (ends && isNaN(ends.getTime())) {
      return NextResponse.json({ message: "endsAt is invalid" }, { status: 400 })
    }
    if (starts && ends && ends <= starts) {
      return NextResponse.json(
        { message: "endsAt must be after startsAt" },
        { status: 400 }
      )
    }

    // product scope
    if (!appliesToAll && productIds !== undefined && productIds !== null && !Array.isArray(productIds)) {
      return NextResponse.json(
        { message: "productIds must be an array of product IDs when provided" },
        { status: 400 }
      )
    }

    const productsJson =
      appliesToAll
        ? null
        : productIds === undefined || productIds === null
          ? null
          : productIds

    // Build create payload
    const createData = {
      title: String(title),
      description: description ? String(description) : null,
      type: t,
      percentageOff: t === "PERCENTAGE" ? Math.floor(Number(percentageOff)) : null,
      fixedAmountOff: t === "FIXED" ? Math.floor(Number(fixedAmountOff)) : null,
      appliesToAll: Boolean(appliesToAll),
      productIds: productsJson,
      isActive: Boolean(isActive),
      startsAt: starts,
      endsAt: ends,
    } as const

    // ✅ Neon-friendly: batch transaction (array)
    if (Boolean(isActive)) {
      const [, created] = await prisma.$transaction([
        prisma.discount.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        }),
        prisma.discount.create({ data: createData }),
      ])

      return NextResponse.json({ discount: created }, { status: 201 })
    }

    // If not active, simple create (no tx)
    const discount = await prisma.discount.create({ data: createData })
    return NextResponse.json({ discount }, { status: 201 })
  } catch (e) {
    console.error("ADMIN_CREATE_DISCOUNT_ERROR", e)
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 })
  }
}
