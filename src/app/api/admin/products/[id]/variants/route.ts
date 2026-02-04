import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { VariantUnit } from "@prisma/client"

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> } // params async
) {
  try {
    const { id } = await context.params

    const body = await req.json()
    const { name, priceNgn, unit, unitWeightKg, stockQty } = body

    if (!name || priceNgn === undefined) {
      return NextResponse.json(
        { message: "name and priceNgn are required" },
        { status: 400 }
      )
    }

    const price = Number(priceNgn)
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { message: "priceNgn must be a positive number" },
        { status: 400 }
      )
    }

    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 })
    }

    const unitValue: VariantUnit =
      unit && Object.values(VariantUnit).includes(String(unit) as VariantUnit)
        ? (String(unit) as VariantUnit)
        : VariantUnit.PIECE

    // unitWeightKg only makes sense when unit is KG
    let weight: number | null = null
    if (unitValue === VariantUnit.KG) {
      if (unitWeightKg === undefined || unitWeightKg === null) {
        // allow null, but recommended you set it (e.g. 1kg)
        weight = null
      } else {
        const w = Number(unitWeightKg)
        weight = Number.isFinite(w) && w > 0 ? w : null
      }
    }

    const qty =
      stockQty === undefined || stockQty === null ? null : Number(stockQty)

    const variant = await prisma.productVariant.create({
      data: {
        productId: id,
        name: String(name),
        unit: unitValue,
        priceNgn: Math.round(price),
        unitWeightKg: weight,
        stockQty: qty === null ? null : Math.max(Math.floor(qty), 0),
      },
    })

    return NextResponse.json({ variant }, { status: 201 })
  } catch (e) {
    console.error("ADMIN_CREATE_VARIANT_ERROR", e)
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    )
  }
}
