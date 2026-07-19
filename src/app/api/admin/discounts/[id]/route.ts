import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";


const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;

type DiscountTypeValue = (typeof DISCOUNT_TYPES)[number];

type JsonObject = Record<string, unknown>;

type DiscountPatchUpdates = {
  title?: string;
  description?: string | null;
  type?: DiscountTypeValue;
  percentageOff?: number | null;
  fixedAmountOff?: number | null;
  appliesToAll?: boolean;
  productIds?: string[] | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
};

type ActiveDiscountForConflict = {
  id: string;
  appliesToAll: boolean;
  productIds: unknown;
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiscountType(value: string): value is DiscountTypeValue {
  return DISCOUNT_TYPES.includes(value as DiscountTypeValue);
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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const rawBody: unknown = await req.json();

    if (!isJsonObject(rawBody)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const body = rawBody;
    const updates: DiscountPatchUpdates = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();

      if (!title) {
        return NextResponse.json(
          { message: "title cannot be empty" },
          { status: 400 }
        );
      }

      updates.title = title;
    }

    if (body.description !== undefined) {
      const description = body.description === null ? "" : String(body.description).trim();
      updates.description = description ? description : null;
    }

    if (body.type !== undefined) {
      const type = String(body.type).trim();

      if (!isDiscountType(type)) {
        return NextResponse.json(
          { message: `type must be one of: ${DISCOUNT_TYPES.join(", ")}` },
          { status: 400 }
        );
      }

      updates.type = type;
      updates.percentageOff = null;
      updates.fixedAmountOff = null;
    }

    if (body.percentageOff !== undefined) {
      if (body.percentageOff === null || body.percentageOff === "") {
        updates.percentageOff = null;
      } else {
        const percentageOff = Number(body.percentageOff);

        if (
          !Number.isFinite(percentageOff) ||
          percentageOff <= 0 ||
          percentageOff > 100
        ) {
          return NextResponse.json(
            { message: "percentageOff must be between 1 and 100" },
            { status: 400 }
          );
        }

        updates.percentageOff = Math.floor(percentageOff);
      }
    }

    if (body.fixedAmountOff !== undefined) {
      if (body.fixedAmountOff === null || body.fixedAmountOff === "") {
        updates.fixedAmountOff = null;
      } else {
        const fixedAmountOff = Number(body.fixedAmountOff);

        if (!Number.isFinite(fixedAmountOff) || fixedAmountOff <= 0) {
          return NextResponse.json(
            { message: "fixedAmountOff must be a positive number" },
            { status: 400 }
          );
        }

        updates.fixedAmountOff = Math.floor(fixedAmountOff);
      }
    }

    if (body.appliesToAll !== undefined) {
      updates.appliesToAll = Boolean(body.appliesToAll);

      if (updates.appliesToAll) {
        updates.productIds = null;
      }
    }

    if (body.productIds !== undefined) {
      if (body.productIds !== null && !Array.isArray(body.productIds)) {
        return NextResponse.json(
          { message: "productIds must be an array or null" },
          { status: 400 }
        );
      }

      updates.productIds = asStringArray(body.productIds);
    }

    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive);
    }

    if (body.startsAt !== undefined) {
      updates.startsAt = body.startsAt ? new Date(String(body.startsAt)) : null;

      if (updates.startsAt && Number.isNaN(updates.startsAt.getTime())) {
        return NextResponse.json(
          { message: "startsAt is invalid" },
          { status: 400 }
        );
      }
    }

    if (body.endsAt !== undefined) {
      updates.endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;

      if (updates.endsAt && Number.isNaN(updates.endsAt.getTime())) {
        return NextResponse.json(
          { message: "endsAt is invalid" },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.discount.findUnique({
      where: { id },
      select: {
        type: true,
        percentageOff: true,
        fixedAmountOff: true,
        appliesToAll: true,
        productIds: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Discount not found" },
        { status: 404 }
      );
    }

    const finalType = updates.type ?? existing.type;
    const finalPercentageOff =
      updates.percentageOff !== undefined
        ? updates.percentageOff
        : existing.percentageOff;
    const finalFixedAmountOff =
      updates.fixedAmountOff !== undefined
        ? updates.fixedAmountOff
        : existing.fixedAmountOff;
    const finalStartsAt =
      updates.startsAt !== undefined ? updates.startsAt : existing.startsAt;
    const finalEndsAt =
      updates.endsAt !== undefined ? updates.endsAt : existing.endsAt;

    if (finalStartsAt && finalEndsAt && finalEndsAt <= finalStartsAt) {
      return NextResponse.json(
        { message: "endsAt must be after startsAt" },
        { status: 400 }
      );
    }

    if (finalType === "PERCENTAGE" && !finalPercentageOff) {
      return NextResponse.json(
        { message: "percentageOff is required for PERCENTAGE discounts" },
        { status: 400 }
      );
    }

    if (finalType === "FIXED" && !finalFixedAmountOff) {
      return NextResponse.json(
        { message: "fixedAmountOff is required for FIXED discounts" },
        { status: 400 }
      );
    }

    const finalAppliesToAll =
      updates.appliesToAll !== undefined
        ? updates.appliesToAll
        : existing.appliesToAll;

    const existingProductIds = asStringArray(existing.productIds);
    const finalProductIds =
      updates.productIds !== undefined ? updates.productIds : existingProductIds;

    if (!finalAppliesToAll) {
      if (!finalProductIds || finalProductIds.length === 0) {
        return NextResponse.json(
          {
            message:
              "productIds (non-empty array) is required when appliesToAll is false",
          },
          { status: 400 }
        );
      }
    }

    const data: Record<string, unknown> = {};

    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;

   if (updates.type !== undefined) {
  data.type = updates.type;
}

    if (updates.percentageOff !== undefined) {
      data.percentageOff = updates.percentageOff;
    }

    if (updates.fixedAmountOff !== undefined) {
      data.fixedAmountOff = updates.fixedAmountOff;
    }

    if (updates.appliesToAll !== undefined) {
      data.appliesToAll = updates.appliesToAll;
    }

    if (updates.productIds !== undefined) {
  data.productIds = updates.productIds;
}

    if (updates.startsAt !== undefined) data.startsAt = updates.startsAt;
    if (updates.endsAt !== undefined) data.endsAt = updates.endsAt;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;

    if (updates.isActive === true) {
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
})) as ActiveDiscountForConflict[];

      const disableIds: string[] = [];

      if (finalAppliesToAll) {
        disableIds.push(
  ...activeDiscounts.map((discount: ActiveDiscountForConflict) => discount.id)
);
      } else {
        for (const discount of activeDiscounts) {
          if (discount.appliesToAll) {
            disableIds.push(discount.id);
            continue;
          }

          const discountProductIds = asStringArray(discount.productIds);

          if (overlaps(discountProductIds, finalProductIds)) {
            disableIds.push(discount.id);
          }
        }
      }

      const [, updatedDiscount] =
        disableIds.length > 0
          ? await prisma.$transaction([
              prisma.discount.updateMany({
                where: { id: { in: disableIds } },
                data: { isActive: false },
              }),
              prisma.discount.update({
  where: { id },
  data: data as never,
}),
            ])
          : [
              null,
              await prisma.discount.update({
                where: { id },
                data,
              }),
            ];

      return NextResponse.json({ discount: updatedDiscount });
    }

    const discount = await prisma.discount.update({
      where: { id },
      data,
    });

    return NextResponse.json({ discount });
  } catch (error: unknown) {
    console.error("ADMIN_UPDATE_DISCOUNT_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}