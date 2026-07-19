import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import { verifyAdminAuthToken } from "@/lib/auth";
import type { NotificationRole } from "./types";

type AuthUser = {
  id: string;
  role: string;
  email?: string | null;
  phone?: string | null;
};

type VendorContext = {
  user: AuthUser;
  vendorId: string;
};

function readUserIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const data = payload as Record<string, unknown>;
  const value = data.sub ?? data.userId ?? data.id;
  return typeof value === "string" && value.length > 0 ? value : "";
}

export async function requireCustomerUser(): Promise<AuthUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("manna_token")?.value;
  if (!token) {
    throw new Error("Unauthorized");
  }

  const payload = verifyAuthToken(token);
  const userId = readUserIdFromPayload(payload);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, phone: true },
  });

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireAdminUser(): Promise<AuthUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("manna_admin_token")?.value;
  if (!token) {
    throw new Error("Unauthorized");
  }

  const payload = verifyAdminAuthToken(token);
  const userId = readUserIdFromPayload(payload);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, phone: true },
  });

  if (!user || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireVendorContext(vendorId?: string | null): Promise<VendorContext> {
  const user = await requireCustomerUser();

  const vendorUser = await prisma.vendorUser.findFirst({
    where: {
      userId: user.id,
      isActive: true,
      ...(vendorId ? { vendorId } : {}),
    },
    select: { vendorId: true },
  });

  if (!vendorUser) {
    throw new Error("Vendor access denied");
  }

  return { user, vendorId: vendorUser.vendorId };
}

export function normalizeRole(value: unknown): NotificationRole {
  if (value === "ADMIN" || value === "VENDOR" || value === "CUSTOMER") {
    return value;
  }
  return "CUSTOMER";
}
