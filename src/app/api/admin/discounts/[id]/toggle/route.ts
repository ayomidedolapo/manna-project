import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const makeActive =
      body?.isActive === undefined ? true : Boolean(body.isActive)

    if (makeActive) {
      // ✅ Neon-safe batch transaction
      const [, updated] = await prisma.$transaction([
        prisma.discount.updateMany({
          where: { isActive: true, NOT: { id } },
          data: { isActive: false },
        }),
        prisma.discount.update({
          where: { id },
          data: { isActive: true },
        }),
      ])

      return NextResponse.json({ discount: updated })
    }

    // Deactivate only this one (no transaction needed)
    const updated = await prisma.discount.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ discount: updated })
  } catch (e) {
    console.error("ADMIN_TOGGLE_DISCOUNT_ERROR", e)
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 })
  }
}
