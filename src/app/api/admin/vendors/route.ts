import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isVendorStatus } from "@/lib/marketplace/constants";
import {
  isJsonObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/marketplace/json";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  const status = req.nextUrl.searchParams.get("status");
  const marketClusterId = req.nextUrl.searchParams.get("marketClusterId");
  const query = req.nextUrl.searchParams.get("q")?.trim();

  const where: Record<string, unknown> = {};

  if (status) {
    if (!isVendorStatus(status)) {
      return NextResponse.json(
        { message: "Invalid vendor status" },
        { status: 400 }
      );
    }

    where.status = status;
  }

  if (marketClusterId) {
    where.marketClusterId = marketClusterId;
  }

  if (query) {
    where.OR = [
      { displayName: { contains: query, mode: "insensitive" } },
      { legalName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
    ];
  }

  const vendors = await prisma.vendor.findMany({
    where: where as never,
    orderBy: [{ createdAt: "desc" }],
    include: {
      marketCluster: true,
      verification: true,
      pickupLocations: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      },
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  return NextResponse.json({ vendors });
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

    const displayName = requiredString(body.displayName);
    const marketClusterId = requiredString(body.marketClusterId);

    if (!displayName || !marketClusterId) {
      return NextResponse.json(
        { message: "displayName and marketClusterId are required" },
        { status: 400 }
      );
    }

    const cluster = await prisma.marketCluster.findUnique({
      where: { id: marketClusterId },
      select: { id: true, isActive: true },
    });

    if (!cluster) {
      return NextResponse.json(
        { message: "Market cluster not found" },
        { status: 404 }
      );
    }

    const statusValue = optionalString(body.status) ?? "DRAFT";

    if (!isVendorStatus(statusValue)) {
      return NextResponse.json(
        { message: "Invalid vendor status" },
        { status: 400 }
      );
    }

    const slug = slugify(optionalString(body.slug) ?? displayName);
    const existing = await prisma.vendor.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { message: "A vendor with this slug already exists" },
        { status: 409 }
      );
    }

    const commissionRateBps = optionalNumber(body.commissionRateBps) ?? 1000;

    if (commissionRateBps < 0 || commissionRateBps > 10000) {
      return NextResponse.json(
        { message: "commissionRateBps must be between 0 and 10000" },
        { status: 400 }
      );
    }

    const isApproved = statusValue === "APPROVED";
    const isActive = optionalBoolean(body.isActive) ?? isApproved;
    const isVisible = optionalBoolean(body.isVisible) ?? isApproved;

    const vendor = await prisma.vendor.create({
      data: {
        displayName,
        slug,
        legalName: optionalString(body.legalName),
        description: optionalString(body.description),
        email: optionalString(body.email),
        phone: optionalString(body.phone),
        supportPhone: optionalString(body.supportPhone),
        logoUrl: optionalString(body.logoUrl),
        coverImageUrl: optionalString(body.coverImageUrl),
        businessRegistrationNumber: optionalString(
          body.businessRegistrationNumber
        ),
        status: statusValue,
        isActive,
        isVisible,
        commissionRateBps,
        marketClusterId,
        adminNotes: optionalString(body.adminNotes),
        approvedAt: isApproved ? new Date() : null,
      } as never,
    });

    await prisma.vendorVerification.create({
      data: {
        vendorId: vendor.id,
        status: isApproved ? "APPROVED" : "PENDING",
      } as never,
    });

    const pickupAddress = optionalString(body.pickupAddress);
    const pickupLat = optionalNumber(body.pickupLat);
    const pickupLng = optionalNumber(body.pickupLng);

    if (pickupAddress && pickupLat !== null && pickupLng !== null) {
      await prisma.vendorPickupLocation.create({
        data: {
          vendorId: vendor.id,
          marketClusterId,
          label: optionalString(body.pickupLabel) ?? "Main pickup point",
          address: pickupAddress,
          latitude: pickupLat,
          longitude: pickupLng,
          contactName: optionalString(body.pickupContactName),
          phone: optionalString(body.pickupPhone),
          isDefault: true,
          isActive: true,
          verificationStatus: isApproved ? "APPROVED" : "PENDING",
          verifiedAt: isApproved ? new Date() : null,
        } as never,
      });
    }

    const created = await prisma.vendor.findUnique({
      where: { id: vendor.id },
      include: {
        marketCluster: true,
        verification: true,
        pickupLocations: true,
      },
    });

    return NextResponse.json({ vendor: created }, { status: 201 });
  } catch (error: unknown) {
    console.error("ADMIN_CREATE_VENDOR_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
