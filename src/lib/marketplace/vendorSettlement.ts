import { prisma } from "@/lib/prisma";

type VendorOrderForSettlement = {
  id: string;
  orderId: string;
  vendorId: string;
  marketClusterId: string;
  grossAmountNgn: number;
  commissionRateBps: number;
  settlementStatus: string;
};

type VendorOrderItemForSettlement = {
  subtotalNgn: number;
};

type OrderForSettlement = {
  id: string;
  status: string;
  paymentStatus: string;
};

export type VendorSettlementGenerationResult = {
  orderId: string;
  createdCount: number;
  skippedCount: number;
  vendorGrossAmountNgn: number;
  mannaCommissionAmountNgn: number;
  vendorPayableAmountNgn: number;
};

function calculateCommission(grossAmountNgn: number, commissionRateBps: number): number {
  return Math.max(0, Math.round((grossAmountNgn * commissionRateBps) / 10_000));
}

async function calculateVendorOrderGrossAmount(vendorOrderId: string): Promise<number> {
  const items = (await prisma.vendorOrderItem.findMany({
    where: { vendorOrderId },
    select: { subtotalNgn: true },
  })) as VendorOrderItemForSettlement[];

  return items.reduce((sum, item) => sum + item.subtotalNgn, 0);
}

export async function generateVendorSettlementsForOrder(
  orderId: string
): Promise<VendorSettlementGenerationResult> {
  const order = (await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
    },
  })) as OrderForSettlement | null;

  if (!order) {
    throw new Error("Order not found.");
  }

  if (order.paymentStatus !== "PAID") {
    throw new Error("Order cannot be settled because payment is not paid.");
  }

  if (order.status !== "DELIVERED") {
    throw new Error("Order cannot be settled until delivery is completed.");
  }

  const vendorOrders = (await prisma.vendorOrder.findMany({
    where: { orderId },
    select: {
      id: true,
      orderId: true,
      vendorId: true,
      marketClusterId: true,
      grossAmountNgn: true,
      commissionRateBps: true,
      settlementStatus: true,
    },
  })) as VendorOrderForSettlement[];

  let createdCount = 0;
  let skippedCount = 0;
  let vendorGrossAmountNgn = 0;
  let mannaCommissionAmountNgn = 0;
  let vendorPayableAmountNgn = 0;

  for (const vendorOrder of vendorOrders) {
    const existingSettlement = await prisma.vendorSettlement.findUnique({
      where: { vendorOrderId: vendorOrder.id },
      select: { id: true },
    });

    if (existingSettlement) {
      skippedCount += 1;
      continue;
    }

    const grossAmountNgn =
      vendorOrder.grossAmountNgn > 0
        ? vendorOrder.grossAmountNgn
        : await calculateVendorOrderGrossAmount(vendorOrder.id);

    const commissionAmountNgn = calculateCommission(
      grossAmountNgn,
      vendorOrder.commissionRateBps
    );

    const payableAmountNgn = Math.max(0, grossAmountNgn - commissionAmountNgn);
    const settlementIdempotencyKey = `vendor-settlement:${vendorOrder.id}`;
    const ledgerIdempotencyKey = `vendor-ledger:settlement-credit:${vendorOrder.id}`;

    const settlement = await prisma.$transaction(async (tx) => {
      const createdSettlement = await tx.vendorSettlement.create({
        data: {
          vendorId: vendorOrder.vendorId,
          orderId,
          vendorOrderId: vendorOrder.id,
          marketClusterId: vendorOrder.marketClusterId,
          status: "PENDING_PAYOUT",
          grossAmountNgn,
          commissionRateBps: vendorOrder.commissionRateBps,
          commissionAmountNgn,
          payableAmountNgn,
          metadata: {
            idempotencyKey: settlementIdempotencyKey,
            source: "KWIK_DELIVERY_COMPLETED",
          },
        } as never,
      });

      await tx.vendorLedgerEntry.create({
        data: {
          vendorId: vendorOrder.vendorId,
          orderId,
          vendorOrderId: vendorOrder.id,
          settlementId: createdSettlement.id,
          entryType: "SETTLEMENT_CREDIT",
          direction: "CREDIT",
          amountNgn: payableAmountNgn,
          idempotencyKey: ledgerIdempotencyKey,
          description: "Vendor payable created after successful delivery.",
          metadata: {
            grossAmountNgn,
            commissionRateBps: vendorOrder.commissionRateBps,
            commissionAmountNgn,
          },
        } as never,
      });

      await tx.vendorOrder.update({
        where: { id: vendorOrder.id },
        data: {
          grossAmountNgn,
          commissionAmountNgn,
          payableAmountNgn,
          settlementStatus: "PENDING_PAYOUT",
          settlementCalculatedAt: new Date(),
          settlementEligibleAt: new Date(),
        } as never,
      });

      await tx.vendor.update({
        where: { id: vendorOrder.vendorId },
        data: {
          payableBalanceNgn: { increment: payableAmountNgn },
          pendingSettlementNgn: { increment: payableAmountNgn },
          lifetimeGrossSalesNgn: { increment: grossAmountNgn },
          lifetimeCommissionNgn: { increment: commissionAmountNgn },
        } as never,
      });

      return createdSettlement;
    });

    if (settlement) {
      createdCount += 1;
      vendorGrossAmountNgn += grossAmountNgn;
      mannaCommissionAmountNgn += commissionAmountNgn;
      vendorPayableAmountNgn += payableAmountNgn;
    }
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      settlementStatus: createdCount > 0 ? "PENDING_PAYOUT" : "ALREADY_SETTLED",
      settlementCalculatedAt: new Date(),
      vendorGrossAmountNgn,
      mannaCommissionAmountNgn,
      vendorPayableAmountNgn,
    } as never,
  });

  return {
    orderId,
    createdCount,
    skippedCount,
    vendorGrossAmountNgn,
    mannaCommissionAmountNgn,
    vendorPayableAmountNgn,
  };
}
