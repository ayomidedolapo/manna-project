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
    const status = url.searchParams.get("status");
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    const memberships = (await prisma.vendorUser.findMany({
      where: { userId: decoded.userId, isActive: true },
      select: { vendorId: true },
    })) as VendorMembership[];

    const vendorIds = memberships.map((membership) => membership.vendorId);

    if (vendorIds.length === 0) {
      return NextResponse.json({ ok: true, vendorOrders: [] }, { status: 200 });
    }

    const vendorOrders = await prisma.vendorOrder.findMany({
      where: {
        vendorId: { in: vendorIds },
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        items: true,
      },
    });

    return NextResponse.json({ ok: true, vendorOrders }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
