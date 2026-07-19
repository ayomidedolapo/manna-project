import { KwikClient } from "./client";
import { assertKwikConfig, getKwikConfig } from "./env";
import {
  buildKwikBillBreakdownPayload,
  buildKwikCreateTaskPayload,
  buildKwikQuotePayload,
  type MarketplaceKwikRouteInput,
} from "./payloadBuilder";
import {
  dataObject,
  ensureKwikSuccess,
  integerNgnFromUnknown,
  jsonArrayOfRecords,
  stringFromUnknown,
} from "./json";
import type { KwikCreateTaskResult, KwikJsonObject, KwikQuoteResult } from "./types";

function readAmountToChargeCustomer(billResponse: KwikJsonObject, quoteResponse: KwikJsonObject): number {
  const billData = dataObject(billResponse);
  const quoteData = dataObject(quoteResponse);

  return (
    integerNgnFromUnknown(billData.NET_PAYABLE_AMOUNT) ??
    integerNgnFromUnknown(billData.PAYABLE_AMOUNT) ??
    integerNgnFromUnknown(billData.ACTUAL_AMOUNT) ??
    integerNgnFromUnknown(quoteData.per_task_cost) ??
    0
  );
}

export async function quoteKwikMarketplaceDelivery(
  input: MarketplaceKwikRouteInput
): Promise<KwikQuoteResult> {
  const config = getKwikConfig();
  assertKwikConfig(config);

  const client = new KwikClient(config.baseUrl, config.requestTimeoutMs);
  const quotePayload = buildKwikQuotePayload(config, input);

  const quoteResponse = await client.postJson(
    "/send_payment_for_task",
    quotePayload as unknown as KwikJsonObject
  );
  ensureKwikSuccess(quoteResponse, "Kwik delivery quote");

  const billPayload = buildKwikBillBreakdownPayload(config, quotePayload, quoteResponse);
  const billResponse = await client.postJson(
    "/get_bill_breakdown",
    billPayload as unknown as KwikJsonObject
  );
  ensureKwikSuccess(billResponse, "Kwik bill breakdown");

  const quoteData = dataObject(quoteResponse);
  const billData = dataObject(billResponse);

  return {
    quotePayload,
    quoteResponse,
    billPayload,
    billResponse,
    pickupCount: quotePayload.pickups.length,
    deliveryCount: quotePayload.deliveries.length,
    amountToChargeCustomerNgn: readAmountToChargeCustomer(billResponse, quoteResponse),
    kwikPerTaskCostNgn: integerNgnFromUnknown(quoteData.per_task_cost),
    kwikTotalServiceChargeNgn: integerNgnFromUnknown(quoteData.total_service_charge),
    kwikPayableAmountNgn: integerNgnFromUnknown(billData.PAYABLE_AMOUNT),
    kwikNetPayableAmountNgn: integerNgnFromUnknown(billData.NET_PAYABLE_AMOUNT),
    kwikDeliveryChargeNgn: integerNgnFromUnknown(billData.DELIVERY_CHARGE),
    kwikSurgeCostNgn: integerNgnFromUnknown(billData.SURGE_PRICING),
    kwikSurgeType: integerNgnFromUnknown(billData.SURGE_TYPE),
    kwikVehicleId: quotePayload.vehicle_id,
    kwikVehicleName: input.vehicleName ?? config.defaultVehicleName,
  };
}

export async function createKwikMarketplaceTaskFromStoredQuote(args: {
  quotePayload: KwikJsonObject;
  quoteResponse: KwikJsonObject;
  billResponse: KwikJsonObject;
}): Promise<KwikCreateTaskResult> {
  const config = getKwikConfig();
  assertKwikConfig(config);

  const client = new KwikClient(config.baseUrl, config.requestTimeoutMs);
  const createPayload = buildKwikCreateTaskPayload(
    config,
    args.quotePayload as never,
    args.quoteResponse,
    args.billResponse
  );

  const createResponse = await client.postJson(
    "/v2/create_task_via_vendor",
    createPayload as unknown as KwikJsonObject
  );
  ensureKwikSuccess(createResponse, "Kwik task creation");

  const data = dataObject(createResponse);
  const pickupRecords = jsonArrayOfRecords(data.pickups);
  const deliveryRecords = jsonArrayOfRecords(data.deliveries);

  const pickupJobIds = pickupRecords
    .map((item) => integerNgnFromUnknown(item.job_id))
    .filter((value): value is number => value !== null);

  const deliveryJobIds = deliveryRecords
    .map((item) => integerNgnFromUnknown(item.job_id))
    .filter((value): value is number => value !== null);

  const trackingLinks = [...pickupRecords, ...deliveryRecords]
    .map((item) => stringFromUnknown(item.result_tracking_link))
    .filter((value): value is string => value !== null);

  const firstJobToken =
    pickupRecords.map((item) => stringFromUnknown(item.job_token)).find(Boolean) ??
    deliveryRecords.map((item) => stringFromUnknown(item.job_token)).find(Boolean) ??
    null;

  return {
    createPayload,
    createResponse,
    kwikUniqueOrderId: stringFromUnknown(data.unique_order_id),
    kwikPickupJobIds: pickupJobIds,
    kwikDeliveryJobIds: deliveryJobIds,
    kwikJobToken: firstJobToken,
    kwikStatusCheckUrl: stringFromUnknown(data.job_status_check_link),
    kwikTrackingLinks: trackingLinks,
  };
}
