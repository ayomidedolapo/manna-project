import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const VARIANT_UNITS = ["PIECE", "KG", "PAINT", "HALF_PAINT", "BASKET"] as const;

type VariantUnitValue = (typeof VARIANT_UNITS)[number];

type JsonObject = Record<string, unknown>;

type VariantUpdates = {
  name?: string;
  priceNgn?: number;
  unit?: VariantUnitValue;
  unitWeightKg?: number | null;
  stockQty?: number | null;
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVariantUnit(value: string): value is VariantUnitValue {
  return VARIANT_UNITS.includes(value as VariantUnitValue);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { variantId } = await ctx.params;
    const rawBody: unknown = await req.json();

    if (!isJsonObject(rawBody)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const body = rawBody;
    const updates: VariantUpdates = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();

      if (!name) {
        return NextResponse.json(
          { message: "name cannot be empty" },
          { status: 400 }
        );
      }

      updates.name = name;
    }

    if (body.priceNgn !== undefined) {
      const price = Number(body.priceNgn);

      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json(
          { message: "priceNgn must be a positive number" },
          { status: 400 }
        );
      }

      updates.priceNgn = Math.round(price);
    }

    if (body.unit !== undefined) {
      const unit = String(body.unit).trim();

      if (!isVariantUnit(unit)) {
        return NextResponse.json(
          { message: `unit must be one of: ${VARIANT_UNITS.join(", ")}` },
          { status: 400 }
        );
      }

      updates.unit = unit;
    }

    if (body.unitWeightKg !== undefined) {
      if (body.unitWeightKg === null || body.unitWeightKg === "") {
        updates.unitWeightKg = null;
      } else {
        const unitWeightKg = Number(body.unitWeightKg);

        if (!Number.isFinite(unitWeightKg) || unitWeightKg <= 0) {
          return NextResponse.json(
            { message: "unitWeightKg must be a positive number or null" },
            { status: 400 }
          );
        }

        updates.unitWeightKg = unitWeightKg;
      }
    }

    if (body.stockQty !== undefined) {
      if (body.stockQty === null || body.stockQty === "") {
        updates.stockQty = null;
      } else {
        const stockQty = Number(body.stockQty);

        if (!Number.isFinite(stockQty) || stockQty < 0) {
          return NextResponse.json(
            { message: "stockQty must be zero, a positive number, or null" },
            { status: 400 }
          );
        }

        updates.stockQty = Math.floor(stockQty);
      }
    }

    if (updates.unit !== undefined && updates.unit !== "KG") {
      updates.unitWeightKg = null;
    }

    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: updates as never,
    });

    return NextResponse.json({ variant });
  } catch (error: unknown) {
    console.error("ADMIN_UPDATE_VARIANT_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { variantId } = await ctx.params;

    await prisma.productVariant.delete({
      where: { id: variantId },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("ADMIN_DELETE_VARIANT_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}