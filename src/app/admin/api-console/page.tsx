import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAdminAuthToken } from "@/lib/auth";
import ApiConsoleClient from "./ApiConsoleClient";

export default async function ApiConsolePage() {
  const cookieStore = await cookies();

  const token = cookieStore.get("manna_admin_token")?.value;

  const session = token ? verifyAdminAuthToken(token) : null;

  if (!session) {
    redirect("/admin/api-console/login");
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });

  if (!admin || admin.role !== "ADMIN") {
    redirect("/admin/api-console/login");
  }

  return <ApiConsoleClient />;
}