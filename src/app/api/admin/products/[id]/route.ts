import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { variants: true },
  });

  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      slug,
      description,
      category,
      imageUrl,
      isActive = true,
      isFeatured = false,
    } = body;

    if (!name || !category) {
      return NextResponse.json(
        { message: "name and category are required" },
        { status: 400 }
      );
    }

    const finalSlug = (slug && String(slug).trim()) ? slugify(String(slug)) : slugify(String(name));

    // Ensure slug uniqueness
    const exists = await prisma.product.findUnique({ where: { slug: finalSlug } });
    if (exists) {
      return NextResponse.json(
        { message: "slug already exists, choose a different one" },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name: String(name),
        slug: finalSlug,
        description: description ? String(description) : null,
        category: String(category),
        imageUrl: imageUrl ? String(imageUrl) : null,
        isActive: Boolean(isActive),
        isFeatured: Boolean(isFeatured),
      },
      include: { variants: true },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    console.error("ADMIN_CREATE_PRODUCT_ERROR", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
