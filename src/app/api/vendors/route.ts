import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const marketClusterId = req.nextUrl.searchParams.get("marketClusterId");
  const query = req.nextUrl.searchParams.get("q")?.trim();

  const where: Record<string, unknown> = {
    status: "APPROVED",
    isActive: true,
    isVisible: true,
  };

  if (marketClusterId) {
    where.marketClusterId = marketClusterId;
  }

  if (query) {
    where.OR = [
      { displayName: { contains: query, mode: "insensitive" } },
      { legalName: { contains: query, mode: "insensitive" } },
    ];
  }

  const vendors = await prisma.vendor.findMany({
    where: where as never,
    orderBy: [{ displayName: "asc" }],
    select: {
      id: true,
      displayName: true,
      slug: true,
      description: true,
      logoUrl: true,
      coverImageUrl: true,
      marketCluster: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          state: true,
        },
      },
      pickupLocations: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1,
        select: {
          id: true,
          label: true,
          address: true,
          latitude: true,
          longitude: true,
          isDefault: true,
        },
      },
    },
  });

  return NextResponse.json({ vendors });
}
