import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import {
  isJsonObject,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/marketplace/json";

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();

    if (!isJsonObject(body)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const displayName = requiredString(body.displayName);
    const marketClusterId = requiredString(body.marketClusterId);
    const email = optionalString(body.email);
    const phone = optionalString(body.phone);
    const pickupAddress = requiredString(body.pickupAddress);
    const pickupLat = optionalNumber(body.pickupLat);
    const pickupLng = optionalNumber(body.pickupLng);

    if (!displayName || !marketClusterId || !pickupAddress) {
      return NextResponse.json(
        {
          message:
            "displayName, marketClusterId, and pickupAddress are required",
        },
        { status: 400 }
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { message: "Either email or phone is required" },
        { status: 400 }
      );
    }

    if (pickupLat === null || pickupLng === null) {
      return NextResponse.json(
        { message: "pickupLat and pickupLng are required numbers" },
        { status: 400 }
      );
    }

    const cluster = await prisma.marketCluster.findFirst({
      where: { id: marketClusterId, isActive: true },
      select: { id: true },
    });

    if (!cluster) {
      return NextResponse.json(
        { message: "Active market cluster not found" },
        { status: 404 }
      );
    }

    const slug = slugify(optionalString(body.slug) ?? displayName);
    const existing = await prisma.vendor.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { message: "A vendor with this business name already exists" },
        { status: 409 }
      );
    }

    if (email) {
      const existingEmail = await prisma.vendor.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingEmail) {
        return NextResponse.json(
          { message: "A vendor with this email already exists" },
          { status: 409 }
        );
      }
    }

    const vendor = await prisma.vendor.create({
      data: {
        displayName,
        slug,
        legalName: optionalString(body.legalName),
        description: optionalString(body.description),
        email,
        phone,
        supportPhone: optionalString(body.supportPhone),
        businessRegistrationNumber: optionalString(
          body.businessRegistrationNumber
        ),
        status: "PENDING_VERIFICATION",
        isActive: false,
        isVisible: false,
        marketClusterId,
      } as never,
    });

    await prisma.vendorVerification.create({
      data: {
        vendorId: vendor.id,
        status: "SUBMITTED",
        contactStatus: "SUBMITTED",
        businessStatus: "SUBMITTED",
        submittedAt: new Date(),
      } as never,
    });

    await prisma.vendorPickupLocation.create({
      data: {
        vendorId: vendor.id,
        marketClusterId,
        label: optionalString(body.pickupLabel) ?? "Main pickup point",
        address: pickupAddress,
        latitude: pickupLat,
        longitude: pickupLng,
        contactName: optionalString(body.pickupContactName),
        phone: optionalString(body.pickupPhone) ?? phone,
        isDefault: true,
        isActive: true,
        verificationStatus: "SUBMITTED",
      } as never,
    });

    return NextResponse.json(
      {
        vendor: {
          id: vendor.id,
          displayName: vendor.displayName,
          slug: vendor.slug,
          status: vendor.status,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("VENDOR_REGISTRATION_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
