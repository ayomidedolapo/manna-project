import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;

type DiscountTypeValue = (typeof DISCOUNT_TYPES)[number];

type JsonObject = Record<string, unknown>;

type DiscountScope = {
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

export async function GET() {
  const discounts = await prisma.discount.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ discounts });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: unknown = await req.json();

    if (!isJsonObject(rawBody)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

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
    } = rawBody;

    const cleanTitle = title === undefined ? "" : String(title).trim();
    const cleanType = type === undefined ? "" : String(type).trim();

    if (!cleanTitle || !cleanType) {
      return NextResponse.json(
        { message: "title and type are required" },
        { status: 400 }
      );
    }

    if (!isDiscountType(cleanType)) {
      return NextResponse.json(
        { message: `type must be one of: ${DISCOUNT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const discountType = cleanType;
    const appliesToAllProducts = Boolean(appliesToAll);
    const shouldActivate = Boolean(isActive);

    let finalPercentageOff: number | null = null;
    let finalFixedAmountOff: number | null = null;

    if (discountType === "PERCENTAGE") {
      const percentage = Number(percentageOff);

      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        return NextResponse.json(
          {
            message:
              "percentageOff must be between 1 and 100 for PERCENTAGE discounts",
          },
          { status: 400 }
        );
      }

      finalPercentageOff = Math.floor(percentage);
    }

    if (discountType === "FIXED") {
      const amount = Number(fixedAmountOff);

      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          {
            message:
              "fixedAmountOff must be a positive number for FIXED discounts",
          },
          { status: 400 }
        );
      }

      finalFixedAmountOff = Math.floor(amount);
    }

    const starts = startsAt ? new Date(String(startsAt)) : null;
    const ends = endsAt ? new Date(String(endsAt)) : null;

    if (starts && Number.isNaN(starts.getTime())) {
      return NextResponse.json(
        { message: "startsAt is invalid" },
        { status: 400 }
      );
    }

    if (ends && Number.isNaN(ends.getTime())) {
      return NextResponse.json(
        { message: "endsAt is invalid" },
        { status: 400 }
      );
    }

    if (starts && ends && ends <= starts) {
      return NextResponse.json(
        { message: "endsAt must be after startsAt" },
        { status: 400 }
      );
    }

    const ids = asStringArray(productIds);

    if (!appliesToAllProducts) {
      if (!ids || ids.length === 0) {
        return NextResponse.json(
          {
            message:
              "productIds (non-empty array) is required when appliesToAll is false",
          },
          { status: 400 }
        );
      }

      const existingCount = await prisma.product.count({
        where: { id: { in: ids } },
      });

      if (existingCount !== ids.length) {
        return NextResponse.json(
          { message: "One or more productIds are invalid" },
          { status: 400 }
        );
      }
    }

    const createData: Record<string, unknown> = {
      title: cleanTitle,
      description:
        description === null || description === undefined
          ? null
          : String(description).trim() || null,
      type: discountType,
      percentageOff: finalPercentageOff,
      fixedAmountOff: finalFixedAmountOff,
      appliesToAll: appliesToAllProducts,
      productIds: appliesToAllProducts ? null : ids,
      isActive: shouldActivate,
      startsAt: starts,
      endsAt: ends,
    };

    if (shouldActivate) {
      const now = new Date();

      const activeDiscounts = (await prisma.discount.findMany({
        where: {
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

      if (appliesToAllProducts) {
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

          if (overlaps(discountIds, ids)) {
            disableIds.push(discount.id);
          }
        }
      }

      const created =
        disableIds.length > 0
          ? (
              await prisma.$transaction([
                prisma.discount.updateMany({
                  where: { id: { in: disableIds } },
                  data: { isActive: false },
                }),
                prisma.discount.create({
                  data: createData as never,
                }),
              ])
            )[1]
          : await prisma.discount.create({
              data: createData as never,
            });

      return NextResponse.json({ discount: created }, { status: 201 });
    }

    const discount = await prisma.discount.create({
      data: createData as never,
    });

    return NextResponse.json({ discount }, { status: 201 });
  } catch (error: unknown) {
    console.error("ADMIN_CREATE_DISCOUNT_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}