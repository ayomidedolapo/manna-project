import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  isJsonObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/marketplace/json";

export async function GET() {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  const clusters = await prisma.marketCluster.findMany({
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          vendors: true,
          products: true,
        },
      },
    },
  });

  return NextResponse.json({ clusters });
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return admin.response;
    }

    const body: unknown = await req.json();

    if (!isJsonObject(body)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const name = requiredString(body.name);
    const city = requiredString(body.city);
    const state = requiredString(body.state);
    const centerAddress = requiredString(body.centerAddress);
    const centerLat = optionalNumber(body.centerLat);
    const centerLng = optionalNumber(body.centerLng);

    if (!name || !city || !state || !centerAddress) {
      return NextResponse.json(
        { message: "name, city, state, and centerAddress are required" },
        { status: 400 }
      );
    }

    if (centerLat === null || centerLng === null) {
      return NextResponse.json(
        { message: "centerLat and centerLng are required numbers" },
        { status: 400 }
      );
    }

    const radiusKm = optionalNumber(body.radiusKm) ?? 2;

    if (radiusKm <= 0) {
      return NextResponse.json(
        { message: "radiusKm must be greater than zero" },
        { status: 400 }
      );
    }

    const slugSource = optionalString(body.slug) ?? name;
    const slug = slugify(slugSource);

    const existing = await prisma.marketCluster.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { message: "A market cluster with this slug already exists" },
        { status: 409 }
      );
    }

    const cluster = await prisma.marketCluster.create({
      data: {
        name,
        slug,
        description: optionalString(body.description),
        city,
        state,
        centerAddress,
        centerLat,
        centerLng,
        radiusKm,
        pickupAddress: optionalString(body.pickupAddress),
        pickupLat: optionalNumber(body.pickupLat),
        pickupLng: optionalNumber(body.pickupLng),
        isActive: optionalBoolean(body.isActive) ?? true,
      } as never,
    });

    return NextResponse.json({ cluster }, { status: 201 });
  } catch (error: unknown) {
    console.error("ADMIN_CREATE_MARKET_CLUSTER_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
