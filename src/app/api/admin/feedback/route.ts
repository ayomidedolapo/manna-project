import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/notifications/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const orderId = url.searchParams.get("orderId");
    const limit = Number(url.searchParams.get("limit") ?? "50");

    const feedback = await prisma.customerFeedback.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(orderId ? { orderId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number.isFinite(limit) ? limit : 50, 100),
    });

    return NextResponse.json({ data: feedback });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load feedback";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
