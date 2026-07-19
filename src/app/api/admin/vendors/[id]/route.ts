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

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      marketCluster: true,
      verification: true,
      pickupLocations: true,
      bankAccounts: true,
      agreements: true,
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  if (!vendor) {
    return NextResponse.json({ message: "Vendor not found" }, { status: 404 });
  }

  return NextResponse.json({ vendor });
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
      "displayName",
      "legalName",
      "description",
      "email",
      "phone",
      "supportPhone",
      "logoUrl",
      "coverImageUrl",
      "businessRegistrationNumber",
      "marketClusterId",
      "adminNotes",
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

    if (body.status !== undefined) {
      const statusValue = String(body.status);

      if (!isVendorStatus(statusValue)) {
        return NextResponse.json(
          { message: "Invalid vendor status" },
          { status: 400 }
        );
      }

      updates.status = statusValue;

      if (statusValue === "APPROVED") {
        updates.isActive = true;
        updates.isVisible = true;
        updates.approvedAt = new Date();
        updates.rejectedAt = null;
        updates.suspendedAt = null;
      }

      if (statusValue === "REJECTED") {
        updates.isActive = false;
        updates.isVisible = false;
        updates.rejectedAt = new Date();
      }

      if (statusValue === "SUSPENDED") {
        updates.isActive = false;
        updates.isVisible = false;
        updates.suspendedAt = new Date();
      }
    }

    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive);
    }

    if (body.isVisible !== undefined) {
      updates.isVisible = Boolean(body.isVisible);
    }

    if (body.commissionRateBps !== undefined) {
      const commissionRateBps = optionalNumber(body.commissionRateBps);

      if (
        commissionRateBps === null ||
        commissionRateBps < 0 ||
        commissionRateBps > 10000
      ) {
        return NextResponse.json(
          { message: "commissionRateBps must be between 0 and 10000" },
          { status: 400 }
        );
      }

      updates.commissionRateBps = commissionRateBps;
    }

    const vendor = await prisma.vendor.update({
      where: { id },
      data: updates as never,
      include: {
        marketCluster: true,
        verification: true,
        pickupLocations: true,
      },
    });

    return NextResponse.json({ vendor });
  } catch (error: unknown) {
    console.error("ADMIN_UPDATE_VENDOR_ERROR", error);

    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
