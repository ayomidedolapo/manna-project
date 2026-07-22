import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/lib/auth";
import { deleteVendorProductMedia } from "@/lib/media/productMediaService";

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

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; mediaId: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: productId, mediaId } = await ctx.params;

  try {
    const media = await deleteVendorProductMedia({
      userId: user.id,
      productId,
      mediaId,
    });

    return NextResponse.json({ media });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete media";
    const status = message.includes("DENIED") ? 403 : message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
