import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getActiveDiscounts, applyDiscountToAmount } from "@/services/discount.service"

type CheckoutItem = {
  productVariantId: string
  quantity: number
}

type CheckoutBody = {
  userId?: string
  items: CheckoutItem[]
  deliveryFeeNgn: number
  deliveryAddress1: string
  deliveryAddress2?: string
  city: string
  state: string
  deliveryNote?: string
}

function makeOrderNumber() {
  // Simple unique-ish order number (you can replace later)
  return `MN-${Date.now()}`
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutBody

    if (!body.items?.length) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 })
    }

    if (!body.deliveryAddress1 || !body.city || !body.state) {
      return NextResponse.json({ error: "Delivery address is incomplete" }, { status: 400 })
    }

    // 1) Load variants and compute total from DB prices (never trust client)
    const variantIds = body.items.map((i) => i.productVariantId)

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    })

    const variantMap = new Map(variants.map((v) => [v.id, v]))

    const orderItems = body.items.map((i) => {
      const v = variantMap.get(i.productVariantId)
      if (!v) throw new Error(`Variant not found: ${i.productVariantId}`)
      if (i.quantity <= 0) throw new Error(`Invalid quantity for variant: ${i.productVariantId}`)

      const unitPriceNgn = v.priceNgn
      const subtotalNgn = unitPriceNgn * i.quantity

      return {
        productId: v.productId,
        productVariantId: v.id,
        quantity: i.quantity,
        unitPriceNgn,
        subtotalNgn,
      }
    })

    const itemsTotalNgn = orderItems.reduce((sum, it) => sum + it.subtotalNgn, 0)

    // 2) Pick the active discount campaign (simple requirement)
    const [discount] = await getActiveDiscounts()

    // 3) Apply discount
    // Your schema supports: appliesToAll OR productIds list
    let discountedItemsTotalNgn = itemsTotalNgn

    if (discount) {
      if (discount.appliesToAll) {
        discountedItemsTotalNgn = applyDiscountToAmount(itemsTotalNgn, discount)
      } else if (discount.productIds) {
        const eligibleProductIds = new Set<string>(discount.productIds as string[])

        const eligibleAmount = orderItems
          .filter((it) => eligibleProductIds.has(it.productId))
          .reduce((sum, it) => sum + it.subtotalNgn, 0)

        const discountedEligibleAmount = applyDiscountToAmount(eligibleAmount, discount)

        // Replace only the eligible portion; keep non-eligible same
        const nonEligibleAmount = itemsTotalNgn - eligibleAmount
        discountedItemsTotalNgn = nonEligibleAmount + discountedEligibleAmount
      }
    }

    const deliveryFeeNgn = Math.max(Number(body.deliveryFeeNgn || 0), 0)
    const totalAmountNgn = discountedItemsTotalNgn + deliveryFeeNgn

    // 4) Create order + items in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: makeOrderNumber(),
          userId: body.userId ?? null,
          totalAmountNgn,
          deliveryFeeNgn,
          deliveryAddress1: body.deliveryAddress1,
          deliveryAddress2: body.deliveryAddress2 ?? null,
          city: body.city,
          state: body.state,
          deliveryNote: body.deliveryNote ?? null,
          items: {
            create: orderItems,
          },
        },
        include: { items: true },
      })

      return created
    })

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      itemsTotalNgn,
      discountedItemsTotalNgn,
      deliveryFeeNgn,
      totalAmountNgn,
      appliedDiscount: discount
        ? { id: discount.id, title: discount.title, type: discount.type }
        : null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout failed"

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
