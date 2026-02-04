import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { VariantUnit } from "@prisma/client"

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ variantId: string }> }
) {
  try {
    const { variantId } = await ctx.params
    const body = await req.json()

    const updates: {
      name?: string
      priceNgn?: number
      unit?: VariantUnit
      unitWeightKg?: number | null
      stockQty?: number | null
    } = {}

    if (body.name !== undefined) updates.name = String(body.name)

    if (body.priceNgn !== undefined) {
      const price = Number(body.priceNgn)
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json(
          { message: "priceNgn must be a positive number" },
          { status: 400 }
        )
      }
      updates.priceNgn = Math.round(price)
    }

    if (body.unit !== undefined) {
      const u = String(body.unit)
      if (!Object.values(VariantUnit).includes(u as VariantUnit)) {
        return NextResponse.json(
          { message: `unit must be one of: ${Object.values(VariantUnit).join(", ")}` },
          { status: 400 }
        )
      }
      updates.unit = u as VariantUnit
    }

    // If unitWeightKg is provided, store it (but it only logically applies to KG)
    if (body.unitWeightKg !== undefined) {
      updates.unitWeightKg =
        body.unitWeightKg === null ? null : Number(body.unitWeightKg)
    }

    if (body.stockQty !== undefined) {
      updates.stockQty = body.stockQty === null ? null : Math.max(Math.floor(Number(body.stockQty)), 0)
    }

    // Optional safety: if unit is changed away from KG, clear unitWeightKg
    if (updates.unit && updates.unit !== VariantUnit.KG) {
      updates.unitWeightKg = null
    }

    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: updates,
    })

    return NextResponse.json({ variant })
  } catch (e) {
    console.error("ADMIN_UPDATE_VARIANT_ERROR", e)
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ variantId: string }> }
) {
  const { variantId } = await ctx.params

  await prisma.productVariant.delete({
    where: { id: variantId },
  })

  return NextResponse.json({ ok: true })
}
