import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

type VendorMembership = {
  vendorId: string;
};

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    const decoded = token ? verifyAuthToken(token) : null;

    if (!decoded?.userId) return unauthorized();

    const url = new URL(req.url);
    const requestedVendorId = url.searchParams.get("vendorId");
    const status = url.searchParams.get("status");
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    const memberships = (await prisma.vendorUser.findMany({
      where: { userId: decoded.userId, isActive: true },
      select: { vendorId: true },
    })) as VendorMembership[];

    const memberVendorIds = memberships.map((membership) => membership.vendorId);

    if (memberVendorIds.length === 0) {
      return NextResponse.json(
        { ok: true, vendors: [], settlements: [], ledgerEntries: [] },
        { status: 200 }
      );
    }

    if (requestedVendorId && !memberVendorIds.includes(requestedVendorId)) {
      return NextResponse.json(
        { ok: false, message: "You do not have access to this vendor" },
        { status: 403 }
      );
    }

    const vendorIds = requestedVendorId ? [requestedVendorId] : memberVendorIds;

    const [vendors, settlements, ledgerEntries] = await Promise.all([
      prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        select: {
          id: true,
          displayName: true,
          payableBalanceNgn: true,
          pendingSettlementNgn: true,
          lifetimeGrossSalesNgn: true,
          lifetimeCommissionNgn: true,
          lifetimePaidOutNgn: true,
          minimumPayoutNgn: true,
          settlementMode: true,
        },
        orderBy: { displayName: "asc" },
      }),
      prisma.vendorSettlement.findMany({
        where: {
          vendorId: { in: vendorIds },
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.vendorLedgerEntry.findMany({
        where: { vendorId: { in: vendorIds } },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    return NextResponse.json(
      { ok: true, vendors, settlements, ledgerEntries },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
