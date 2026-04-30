import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const now = new Date();

    // 1) User basic
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        isFaceCaptured: true,
        isFaceVerified: true,
        createdAt: true,
      },
    });

    if (!user) return unauthorized();

    // 2) Active discounts (global for everyone)
    const activeDiscounts = await prisma.discount.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        percentageOff: true,
        fixedAmountOff: true,
        appliesToAll: true,
        productIds: true,
        startsAt: true,
        endsAt: true,
      },
      take: 3, // keep UI clean; increase if you want
    });

    // 3) Categories + subcategories map (for “feature categories” section)
    const categoryPairs = await prisma.product.findMany({
      where: { isActive: true },
      select: { category: true, subCategory: true },
      distinct: ["category", "subCategory"],
    });

    // Build: [{ name: "Fruits", subCategories: ["Citrus", "Berries"] }, ...]
    const categoryMap = new Map<string, Set<string>>();
    for (const row of categoryPairs) {
      const cat = row.category?.trim();
      if (!cat) continue;
      if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());

      const sub = row.subCategory?.trim();
      if (sub) categoryMap.get(cat)!.add(sub);
    }

    const categories = Array.from(categoryMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, subs]) => ({
        name,
        subCategories: Array.from(subs).sort((a, b) => a.localeCompare(b)),
      }));

    // 4) Featured products (explicitly curated)
    const featuredProducts = await prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 8,
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        subCategory: true,
        imageUrl: true,
        isFeatured: true,
        variants: {
          orderBy: [{ priceNgn: "asc" }],
          take: 1, // cheapest variant as “starting price”
          select: { id: true, name: true, priceNgn: true, unit: true, unitWeightKg: true, stockQty: true },
        },
      },
    });

    // 5) Most ordered products (data-driven)
    const topOrdered = await prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 8,
    });

    const topProductIds = topOrdered.map((x) => x.productId);
    const topProductsRaw = topProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: topProductIds }, isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            subCategory: true,
            imageUrl: true,
            variants: {
              orderBy: [{ priceNgn: "asc" }],
              take: 1,
              select: { id: true, name: true, priceNgn: true, unit: true, unitWeightKg: true, stockQty: true },
            },
          },
        })
      : [];

    // Keep the same ranking order as groupBy result
    const qtyMap = new Map<string, number>();
    for (const row of topOrdered) qtyMap.set(row.productId, row._sum.quantity ?? 0);

    const topProductsByPopularity = topProductIds
      .map((id) => {
        const p = topProductsRaw.find((x) => x.id === id);
        if (!p) return null;
        return { ...p, totalOrderedQty: qtyMap.get(id) ?? 0 };
      })
      .filter(Boolean);

    // 6) Order summary (for quick dashboard stats)
    const [pendingPaymentCount, processingCount, outForDeliveryCount, deliveredCount] =
      await Promise.all([
        prisma.order.count({
          where: { userId: user.id, status: "PENDING_PAYMENT" },
        }),
        prisma.order.count({
          where: { userId: user.id, status: "PROCESSING" },
        }),
        prisma.order.count({
          where: { userId: user.id, status: "OUT_FOR_DELIVERY" },
        }),
        prisma.order.count({
          where: { userId: user.id, status: "DELIVERED" },
        }),
      ]);

    // 7) Recent orders (for quick “Your recent activity”)
    const recentOrders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalAmountNgn: true,
        deliveryFeeNgn: true,
        city: true,
        state: true,
        deliveryEstimate: true,
        createdAt: true,
        delivery: {
          select: {
            id: true,
            status: true,
            kwikTrackingUrl: true,
            kwikTaskId: true,
            kwikUniqueOrderId: true,
            deliveredAt: true,
          },
        },
        items: {
          take: 3, // “brief preview” of items
          select: {
            id: true,
            quantity: true,
            unitPriceNgn: true,
            subtotalNgn: true,
            product: { select: { id: true, name: true, imageUrl: true, slug: true } },
            productVariant: { select: { id: true, name: true, unit: true, unitWeightKg: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        user,
        discounts: activeDiscounts,
        categories,
        featuredProducts,
        mostOrderedProducts: topProductsByPopularity,
        orderSummary: {
          pendingPayment: pendingPaymentCount,
          processing: processingCount,
          outForDelivery: outForDeliveryCount,
          delivered: deliveredCount,
        },
        recentOrders,
        // cartSummary: null // needs schema (see below)
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("ME_DASHBOARD_ERROR", error);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
