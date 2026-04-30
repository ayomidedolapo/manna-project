import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const page = toInt(url.searchParams.get("page"), 1);
    const pageSizeRaw = toInt(url.searchParams.get("pageSize"), 20);
    const pageSize = Math.min(pageSizeRaw, 100); // cap

    const status = url.searchParams.get("status"); // OrderStatus
    const paymentStatus = url.searchParams.get("paymentStatus"); // PaymentStatus
    const q = (url.searchParams.get("q") || "").trim();

    const where: any = {};

    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { user: { is: { phone: { contains: q, mode: "insensitive" } } } },
        { user: { is: { email: { contains: q, mode: "insensitive" } } } },
        { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [total, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, phone: true, email: true } },
          delivery: true,
          items: {
            include: {
              product: { select: { id: true, name: true, slug: true, imageUrl: true } },
              productVariant: { select: { id: true, name: true, unit: true, unitWeightKg: true } },
            },
          },
        },
      }),
    ]);

    return Response.json({
      ok: true,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      orders,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "list_orders_error" },
      { status: 500 }
    );
  }
}
