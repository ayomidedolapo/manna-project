import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAdminAuthToken } from "@/lib/auth";

type AdminUser = {
  id: string;
  role: string;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getAdmin(): Promise<AdminUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("manna_admin_token")?.value;
  if (!token) return null;
  return verifyAdminAuthToken(token) as Promise<AdminUser | null>;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ mediaId: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { mediaId } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);

  if (!isJsonObject(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const approvalStatus = body.approvalStatus;
  const rejectionReason = body.rejectionReason;

  if (approvalStatus !== "APPROVED" && approvalStatus !== "REJECTED") {
    return NextResponse.json({ error: "approvalStatus must be APPROVED or REJECTED" }, { status: 400 });
  }

  const media = await prisma.mediaAsset.update({
    where: { id: mediaId },
    data: {
      approvalStatus,
      approvedAt: approvalStatus === "APPROVED" ? new Date() : null,
      approvedByAdminId: approvalStatus === "APPROVED" ? admin.id : null,
      rejectedAt: approvalStatus === "REJECTED" ? new Date() : null,
      rejectionReason: approvalStatus === "REJECTED" && typeof rejectionReason === "string" ? rejectionReason : null,
    } as never,
  }) as { productId?: string | null; mediaType?: string; publicUrl?: string | null };

  if (approvalStatus === "APPROVED" && media.productId && media.mediaType === "IMAGE" && media.publicUrl) {
    await prisma.product.update({
      where: { id: media.productId },
      data: { imageUrl: media.publicUrl },
    });
  }

  return NextResponse.json({ media });
}
