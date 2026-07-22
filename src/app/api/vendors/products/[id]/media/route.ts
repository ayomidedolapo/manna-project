import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import { assertVendorCanManageProduct, uploadProductMedia } from "@/lib/media/productMediaService";

export const runtime = "nodejs";

type AuthUser = {
  id: string;
};

async function getUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("manna_token")?.value;
  if (!token) return null;
  return verifyAuthToken(token) as Promise<AuthUser | null>;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: productId } = await ctx.params;

  try {
    await assertVendorCanManageProduct(user.id, productId);

    const media = await prisma.mediaAsset.findMany({
      where: {
        productId,
        approvalStatus: { not: "DELETED" },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ media });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list media";
    const status = message.includes("DENIED") ? 403 : message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: productId } = await ctx.params;
  const formData = await req.formData();
  const file = formData.get("file");
  const purpose = formData.get("purpose");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const media = await uploadProductMedia({
      userId: user.id,
      productId,
      file,
      purpose: typeof purpose === "string" ? purpose : undefined,
    });

    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload media";
    const status = message.includes("DENIED") ? 403 : message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
