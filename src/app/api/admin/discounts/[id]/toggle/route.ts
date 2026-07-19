import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type JsonObject = Record<string, unknown>;

type DiscountScope = {
  id: string;
  appliesToAll: boolean;
  productIds: unknown;
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;

  const cleaned = value
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean);

  return cleaned.length ? cleaned : [];
}

function overlaps(a: string[] | null, b: string[] | null) {
  if (!a?.length || !b?.length) return false;

  const set = new Set(a);
  return b.some((item) => set.has(item));
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const rawBody: unknown = await req.json().catch(() => ({}));

    if (!isJsonObject(rawBody)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const makeActive =
      rawBody.isActive === undefined ? true : Boolean(rawBody.isActive);

    if (!makeActive) {
      const updated = await prisma.discount.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({ discount: updated });
    }

    const target = (await prisma.discount.findUnique({
      where: { id },
      select: {
        id: true,
        appliesToAll: true,
        productIds: true,
      },
    })) as DiscountScope | null;

    if (!target) {
      return NextResponse.json(
        { message: "Discount not found" },
        { status: 404 }
      );
    }

    const targetIds = asStringArray(target.productIds);
    const now = new Date();

    const activeDiscounts = (await prisma.discount.findMany({
      where: {
        id: { not: id },
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      select: {
        id: true,
        appliesToAll: true,
        productIds: true,
      },
    })) as DiscountScope[];

    const disableIds: string[] = [];

    if (target.appliesToAll) {
      disableIds.push(
        ...activeDiscounts.map((discount: DiscountScope) => discount.id)
      );
    } else {
      for (const discount of activeDiscounts) {
        if (discount.appliesToAll) {
          disableIds.push(discount.id);
          continue;
        }

        const discountIds = asStringArray(discount.productIds);

        if (overlaps(discountIds, targetIds)) {
          disableIds.push(discount.id);
        }
      }
    }

    const updated =
      disableIds.length > 0
        ? (
            await prisma.$transaction([
              prisma.discount.updateMany({
                where: { id: { in: disableIds } },
                data: { isActive: false },
              }),
              prisma.discount.update({
                where: { id },
                data: { isActive: true },
              }),
            ])
          )[1]
        : await prisma.discount.update({
            where: { id },
            data: { isActive: true },
          });

    return NextResponse.json({ discount: updated });
  } catch (error: unknown) {
    console.error("ADMIN_TOGGLE_DISCOUNT_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}