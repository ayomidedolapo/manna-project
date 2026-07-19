import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  isJsonObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
} from "@/lib/marketplace/json";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  const { id } = await ctx.params;

  const cluster = await prisma.marketCluster.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          vendors: true,
          products: true,
        },
      },
    },
  });

  if (!cluster) {
    return NextResponse.json(
      { message: "Market cluster not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ cluster });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return admin.response;
    }

    const { id } = await ctx.params;
    const body: unknown = await req.json();

    if (!isJsonObject(body)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};

    const stringFields = [
      "name",
      "description",
      "city",
      "state",
      "centerAddress",
      "pickupAddress",
    ] as const;

    for (const field of stringFields) {
      if (body[field] !== undefined) {
        updates[field] = optionalString(body[field]);
      }
    }

    if (body.slug !== undefined) {
      const slugValue = optionalString(body.slug);
      if (slugValue) updates.slug = slugify(slugValue);
    }

    const numberFields = [
      "centerLat",
      "centerLng",
      "radiusKm",
      "pickupLat",
      "pickupLng",
    ] as const;

    for (const field of numberFields) {
      if (body[field] !== undefined) {
        updates[field] = optionalNumber(body[field]);
      }
    }

    if (typeof updates.radiusKm === "number" && updates.radiusKm <= 0) {
      return NextResponse.json(
        { message: "radiusKm must be greater than zero" },
        { status: 400 }
      );
    }

    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive);
    }

    const cluster = await prisma.marketCluster.update({
      where: { id },
      data: updates as never,
    });

    return NextResponse.json({ cluster });
  } catch (error: unknown) {
    console.error("ADMIN_UPDATE_MARKET_CLUSTER_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
