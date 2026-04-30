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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    const updates: Partial<{
      title: string;
      description: string | null;
      type: DiscountType;
      percentageOff: number | null;
      fixedAmountOff: number | null;
      appliesToAll: boolean;
      productIds: string[] | null;
      startsAt: Date | null;
      endsAt: Date | null;
      isActive: boolean;
    }> = {};

    if (body.title !== undefined) updates.title = String(body.title);
    if (body.description !== undefined)
      updates.description = body.description ? String(body.description) : null;

    if (body.type !== undefined) {
      const t = String(body.type);
      if (!Object.values(DiscountType).includes(t as DiscountType)) {
        return NextResponse.json(
          { message: `type must be one of: ${Object.values(DiscountType).join(", ")}` },
          { status: 400 }
        );
      }
      updates.type = t as DiscountType;
      updates.percentageOff = null;
      updates.fixedAmountOff = null;
    }

    if (body.percentageOff !== undefined) {
      const pct = Number(body.percentageOff);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json(
          { message: "percentageOff must be between 1 and 100" },
          { status: 400 }
        );
      }
      updates.percentageOff = Math.floor(pct);
    }

    if (body.fixedAmountOff !== undefined) {
      const amt = Number(body.fixedAmountOff);
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json(
          { message: "fixedAmountOff must be a positive number" },
          { status: 400 }
        );
      }
      updates.fixedAmountOff = Math.floor(amt);
    }

    if (body.appliesToAll !== undefined) {
      updates.appliesToAll = Boolean(body.appliesToAll);
      if (updates.appliesToAll) updates.productIds = null;
    }

    if (body.productIds !== undefined) {
      if (!Array.isArray(body.productIds) && body.productIds !== null) {
        return NextResponse.json(
          { message: "productIds must be an array or null" },
          { status: 400 }
        );
      }
      updates.productIds = body.productIds;
    }

    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive);
    }

    if (body.startsAt !== undefined) {
      updates.startsAt = body.startsAt ? new Date(body.startsAt) : null;
      if (updates.startsAt && isNaN(updates.startsAt.getTime())) {
        return NextResponse.json({ message: "startsAt is invalid" }, { status: 400 });
      }
    }

    if (body.endsAt !== undefined) {
      updates.endsAt = body.endsAt ? new Date(body.endsAt) : null;
      if (updates.endsAt && isNaN(updates.endsAt.getTime())) {
        return NextResponse.json({ message: "endsAt is invalid" }, { status: 400 });
      }
    }

    if (updates.startsAt && updates.endsAt && updates.endsAt <= updates.startsAt) {
      return NextResponse.json(
        { message: "endsAt must be after startsAt" },
        { status: 400 }
      );
    }

    // Load existing discount to validate final state
    const existing = await prisma.discount.findUnique({
      where: { id },
      select: { appliesToAll: true, productIds: true },
    });

    if (!existing) {
      return NextResponse.json({ message: "Discount not found" }, { status: 404 });
    }

    const finalAppliesToAll =
      updates.appliesToAll !== undefined ? updates.appliesToAll : existing.appliesToAll;

    const existingIds =
      Array.isArray(existing.productIds) ? (existing.productIds as unknown as string[]) : null;

    const finalProductIds =
      updates.productIds !== undefined ? updates.productIds : existingIds;

    if (!finalAppliesToAll) {
      if (!finalProductIds || !Array.isArray(finalProductIds) || finalProductIds.length === 0) {
        return NextResponse.json(
          { message: "productIds (non-empty array) is required when appliesToAll is false" },
          { status: 400 }
        );
      }
    }

    const data: Prisma.DiscountUpdateInput = { ...updates } as Prisma.DiscountUpdateInput;

    if (updates.productIds !== undefined) {
      data.productIds =
        updates.productIds === null
          ? Prisma.JsonNull
          : (updates.productIds as Prisma.InputJsonValue);
    }

    // ✅ If activating, disable conflicting discounts
    if (updates.isActive === true) {
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

      const ids = Array.isArray(finalProductIds) ? finalProductIds : null;

      if (finalAppliesToAll) {
        disableIds.push(...activeDiscounts.map((d) => d.id));
      } else {
        for (const d of activeDiscounts) {
          if (d.appliesToAll) {
            disableIds.push(d.id);
            continue;
          }
          const dIds = Array.isArray(d.productIds) ? (d.productIds as unknown as string[]) : null;
          if (overlaps(dIds, ids)) disableIds.push(d.id);
        }
      }

      const [, updated] = await prisma.$transaction([
        disableIds.length
          ? prisma.discount.updateMany({
              where: { id: { in: disableIds } },
              data: { isActive: false },
            })
          : prisma.discount.updateMany({ where: { id: { in: [] } }, data: { isActive: false } }),
        prisma.discount.update({ where: { id }, data }),
      ]);

      return NextResponse.json({ discount: updated });
    }

    const discount = await prisma.discount.update({ where: { id }, data });
    return NextResponse.json({ discount });
  } catch (e) {
    console.error("ADMIN_UPDATE_DISCOUNT_ERROR", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
