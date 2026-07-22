import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ProductLookup = {
  id: string;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;

  const product = await prisma.product.findUnique({
    where: { slug },
    select: { id: true },
  }) as ProductLookup | null;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const media = await prisma.mediaAsset.findMany({
    where: {
      productId: product.id,
      approvalStatus: "APPROVED",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      mediaType: true,
      purpose: true,
      contentType: true,
      publicUrl: true,
      originalFilename: true,
      sizeBytes: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ media });
}
