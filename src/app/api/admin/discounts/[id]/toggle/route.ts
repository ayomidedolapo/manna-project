import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function overlaps(a: string[] | null, b: string[] | null) {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const makeActive = body?.isActive === undefined ? true : Boolean(body.isActive);

    if (!makeActive) {
      const updated = await prisma.discount.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ discount: updated });
    }

    // Load the target discount scope
    const target = await prisma.discount.findUnique({
      where: { id },
      select: { id: true, appliesToAll: true, productIds: true },
    });

    if (!target) {
      return NextResponse.json({ message: "Discount not found" }, { status: 404 });
    }

    const targetIds = Array.isArray(target.productIds)
      ? (target.productIds as unknown as string[])
      : null;

    const now = new Date();

    const activeDiscounts = await prisma.discount.findMany({
      where: {
        id: { not: id },
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      select: { id: true, appliesToAll: true, productIds: true },
    });

    const disableIds: string[] = [];

    if (target.appliesToAll) {
      // global discount should be exclusive
      disableIds.push(...activeDiscounts.map((d) => d.id));
    } else {
      // disable global + overlapping product discounts
      for (const d of activeDiscounts) {
        if (d.appliesToAll) {
          disableIds.push(d.id);
          continue;
        }
        const dIds = Array.isArray(d.productIds)
          ? (d.productIds as unknown as string[])
          : null;

        if (overlaps(dIds, targetIds)) disableIds.push(d.id);
      }
    }

    const [, updated] = await prisma.$transaction([
      disableIds.length
        ? prisma.discount.updateMany({
            where: { id: { in: disableIds } },
            data: { isActive: false },
          })
        : prisma.discount.updateMany({ where: { id: { in: [] } }, data: { isActive: false } }),
      prisma.discount.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);

    return NextResponse.json({ discount: updated });
  } catch (e) {
    console.error("ADMIN_TOGGLE_DISCOUNT_ERROR", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
