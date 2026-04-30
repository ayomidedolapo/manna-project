import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

export async function requireOrderAccess(orderId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("manna_token")?.value;

  if (!token) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  const decoded = verifyAuthToken(token);
  if (!decoded?.userId) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true },
  });

  if (!order) {
    return { ok: false as const, status: 404, message: "Order not found" };
  }

  const isOwner = order.userId && order.userId === decoded.userId;
  const isAdmin = decoded.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    return { ok: false as const, status: 403, message: "Forbidden" };
  }

  return { ok: true as const, decoded, order };
}
