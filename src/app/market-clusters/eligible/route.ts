import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  haversineDistanceKm,
  parseCoordinate,
} from "@/lib/marketplace/geo";

type MarketClusterForEligibility = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  centerAddress: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
};

export async function GET(req: NextRequest) {
  const lat = parseCoordinate(req.nextUrl.searchParams.get("lat"));
  const lng = parseCoordinate(req.nextUrl.searchParams.get("lng"));

  if (lat === null || lng === null) {
    return NextResponse.json(
      { message: "lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  const clusters = (await prisma.marketCluster.findMany({
    where: { isActive: true },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      state: true,
      centerAddress: true,
      centerLat: true,
      centerLng: true,
      radiusKm: true,
      pickupAddress: true,
      pickupLat: true,
      pickupLng: true,
    },
  })) as MarketClusterForEligibility[];

  const customerPoint = { lat, lng };

  const eligibleClusters = clusters
    .map((cluster: MarketClusterForEligibility) => {
      const distanceKm = haversineDistanceKm(customerPoint, {
        lat: cluster.centerLat,
        lng: cluster.centerLng,
      });

      return {
        ...cluster,
        distanceKm,
        isEligible: distanceKm <= cluster.radiusKm,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return NextResponse.json({ clusters: eligibleClusters });
}
