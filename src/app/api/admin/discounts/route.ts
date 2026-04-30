import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DiscountType, Prisma } from "@prisma/client";

function asStringArray(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  const cleaned = v.map(String).map((x) => x.trim()).filter(Boolean);
  return cleaned.length ? cleaned : [];
}

function overlaps(a: string[] | null, b: string[] | null) {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

export async function GET() {
  const discounts = await prisma.discount.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ discounts });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

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
    } = body;

    if (!title || !type) {
      return NextResponse.json(
        { message: "title and type are required" },
        { status: 400 }
      );
    }

    if (!Object.values(DiscountType).includes(String(type) as DiscountType)) {
      return NextResponse.json(
        { message: `type must be one of: ${Object.values(DiscountType).join(", ")}` },
        { status: 400 }
      );
    }

    const t = String(type) as DiscountType;

    // validate discount value
    if (t === "PERCENTAGE") {
      const pct = Number(percentageOff);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json(
          { message: "percentageOff must be between 1 and 100 for PERCENTAGE discounts" },
          { status: 400 }
        );
      }
    }

    if (t === "FIXED") {
      const amt = Number(fixedAmountOff);
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json(
          { message: "fixedAmountOff must be a positive number for FIXED discounts" },
          { status: 400 }
        );
      }
    }

    // validate schedule (optional)
    const starts = startsAt ? new Date(startsAt) : null;
    const ends = endsAt ? new Date(endsAt) : null;

    if (starts && isNaN(starts.getTime())) {
      return NextResponse.json({ message: "startsAt is invalid" }, { status: 400 });
    }
    if (ends && isNaN(ends.getTime())) {
      return NextResponse.json({ message: "endsAt is invalid" }, { status: 400 });
    }
    if (starts && ends && ends <= starts) {
      return NextResponse.json(
        { message: "endsAt must be after startsAt" },
        { status: 400 }
      );
    }

    // ✅ product scope rule (this is the key change)
    const ids = asStringArray(productIds);

    if (!Boolean(appliesToAll)) {
      if (!ids || ids.length === 0) {
        return NextResponse.json(
          { message: "productIds (non-empty array) is required when appliesToAll is false" },
          { status: 400 }
        );
      }

      // optional: verify those products exist
      const existingCount = await prisma.product.count({ where: { id: { in: ids } } });
      if (existingCount !== ids.length) {
        return NextResponse.json(
          { message: "One or more productIds are invalid" },
          { status: 400 }
        );
      }
    }

    const createData: Prisma.DiscountCreateInput = {
      title: String(title),
      description: description ? String(description) : null,
      type: t,
      percentageOff: t === "PERCENTAGE" ? Math.floor(Number(percentageOff)) : null,
      fixedAmountOff: t === "FIXED" ? Math.floor(Number(fixedAmountOff)) : null,
      appliesToAll: Boolean(appliesToAll),
      productIds: Boolean(appliesToAll) ? Prisma.JsonNull : (ids as Prisma.InputJsonValue),
      isActive: Boolean(isActive),
      startsAt: starts,
      endsAt: ends,
    };

    // ✅ activation logic change: allow multiple active discounts per products
    if (Boolean(isActive)) {
      const now = new Date();

      const activeDiscounts = await prisma.discount.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        select: { id: true, appliesToAll: true, productIds: true },
      });

      const disableIds: string[] = [];

      if (Boolean(appliesToAll)) {
        // global discount should be exclusive
        disableIds.push(...activeDiscounts.map((d) => d.id));
      } else {
        // only disable active discounts that overlap the same products,
        // plus any active global discount.
        for (const d of activeDiscounts) {
          if (d.appliesToAll) {
            disableIds.push(d.id);
            continue;
          }

          const dIds = Array.isArray(d.productIds) ? (d.productIds as unknown as string[]) : null;
          if (overlaps(dIds, ids)) disableIds.push(d.id);
        }
      }

      const [_, created] = await prisma.$transaction([
        disableIds.length
          ? prisma.discount.updateMany({
              where: { id: { in: disableIds } },
              data: { isActive: false },
            })
          : prisma.discount.updateMany({ where: { id: { in: [] } }, data: { isActive: false } }),
        prisma.discount.create({ data: createData }),
      ]);

      return NextResponse.json({ discount: created }, { status: 201 });
    }

    const discount = await prisma.discount.create({ data: createData });
    return NextResponse.json({ discount }, { status: 201 });
  } catch (e) {
    console.error("ADMIN_CREATE_DISCOUNT_ERROR", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
