import type {
  KwikBillBreakdownPayload,
  KwikConfig,
  KwikCreateTaskPayload,
  KwikDeliveryStop,
  KwikJsonObject,
  KwikQuotePayload,
  KwikStop,
} from "./types";
import { dataObject, integerNgnFromUnknown, numberFromUnknown } from "./json";

export type VendorPickupInput = {
  vendorId: string;
  vendorName: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  email?: string;
  readyTime?: Date;
};

export type CustomerDeliveryInput = {
  name: string;
  phone: string;
  email?: string;
  address: string;
  latitude: number;
  longitude: number;
  deliveryTime?: Date;
  instruction?: string;
};

export type MarketplaceKwikRouteInput = {
  pickups: VendorPickupInput[];
  delivery: CustomerDeliveryInput;
  vehicleId?: number;
  vehicleName?: string;
  parcelAmountNgn?: number;
  deliveryImages?: string;
  requiresOtp?: boolean;
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatKwikDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return trimmed || "+2340000000000";
}

function uniquePickupsByVendor(input: VendorPickupInput[]): VendorPickupInput[] {
  const seen = new Set<string>();
  const result: VendorPickupInput[] = [];

  for (const pickup of input) {
    if (seen.has(pickup.vendorId)) continue;
    seen.add(pickup.vendorId);
    result.push(pickup);
  }

  return result;
}

export function buildKwikStops(
  input: MarketplaceKwikRouteInput
): { pickups: KwikStop[]; deliveries: KwikDeliveryStop[] } {
  const now = new Date();
  const uniquePickups = uniquePickupsByVendor(input.pickups);

  const pickups = uniquePickups.map((pickup, index): KwikStop => {
    const pickupTime = pickup.readyTime ?? new Date(now.getTime() + (index + 1) * 5 * 60 * 1000);

    return {
      address: pickup.address,
      name: pickup.vendorName,
      latitude: pickup.latitude,
      longitude: pickup.longitude,
      time: formatKwikDateTime(pickupTime),
      phone: normalizePhone(pickup.phone),
      email: pickup.email ?? "",
    };
  });

  const deliveryTime =
    input.delivery.deliveryTime ?? new Date(now.getTime() + Math.max(30, pickups.length * 8) * 60 * 1000);

  const deliveries: KwikDeliveryStop[] = [
    {
      address: input.delivery.address,
      name: input.delivery.name,
      latitude: input.delivery.latitude,
      longitude: input.delivery.longitude,
      time: formatKwikDateTime(deliveryTime),
      phone: normalizePhone(input.delivery.phone),
      email: input.delivery.email ?? "",
      has_return_task: false,
      is_package_insured: 0,
      hadVairablePayment: 1,
      hadFixedPayment: 0,
      is_task_otp_required: input.requiresOtp ? 1 : 0,
    },
  ];

  return { pickups, deliveries };
}

export function buildKwikQuotePayload(
  config: KwikConfig,
  input: MarketplaceKwikRouteInput
): KwikQuotePayload {
  const { pickups, deliveries } = buildKwikStops(input);

  return {
    custom_field_template: config.customFieldTemplate,
    access_token: config.accessToken,
    domain_name: config.domainName,
    timezone: config.timezoneOffsetMinutes,
    vendor_id: config.vendorId,
    is_multiple_tasks: 1,
    layout_type: 0,
    pickup_custom_field_template: config.customFieldTemplate,
    deliveries,
    has_pickup: 1,
    has_delivery: 1,
    auto_assignment: 1,
    user_id: config.userId,
    pickups,
    payment_method: config.paymentMethod,
    form_id: config.formId,
    vehicle_id: input.vehicleId ?? config.defaultVehicleId,
    delivery_instruction: input.delivery.instruction ?? "Manna marketplace order",
    delivery_images: input.deliveryImages ?? "",
    is_loader_required: 0,
    loaders_amount: 0,
    loaders_count: 0,
    is_cod_job: input.parcelAmountNgn ? 1 : 0,
    parcel_amount: input.parcelAmountNgn,
  };
}

export function buildKwikBillBreakdownPayload(
  config: KwikConfig,
  quotePayload: KwikQuotePayload,
  quoteResponse: KwikJsonObject
): KwikBillBreakdownPayload {
  const quoteData = dataObject(quoteResponse);
  const perTaskCost = integerNgnFromUnknown(quoteData.per_task_cost) ?? 0;
  const totalServiceCharge = integerNgnFromUnknown(quoteData.total_service_charge) ?? 0;
  const insuranceAmount = integerNgnFromUnknown(quoteData.insurance_amount) ?? 0;
  const totalNoOfTasks = numberFromUnknown(quoteData.total_no_of_tasks) ?? quotePayload.deliveries.length;

  return {
    access_token: config.accessToken,
    benefit_type: null,
    amount: String(perTaskCost),
    insurance_amount: insuranceAmount,
    total_no_of_tasks: totalNoOfTasks,
    pickup_time: quotePayload.pickups[0]?.time ?? formatKwikDateTime(new Date()),
    user_id: config.userId,
    form_id: config.formId,
    promo_value: null,
    domain_name: config.domainName,
    credits: 0,
    total_service_charge: totalServiceCharge,
    vehicle_id: quotePayload.vehicle_id,
    delivery_images: quotePayload.delivery_images,
    is_loader_required: quotePayload.is_loader_required,
    loaders_amount: quotePayload.loaders_amount,
    loaders_count: quotePayload.loaders_count,
    is_cod_job: quotePayload.is_cod_job,
    parcel_amount: quotePayload.parcel_amount,
    delivery_charge_by_buyer: 1,
    delivery_instruction: quotePayload.delivery_instruction,
  };
}

export function buildKwikCreateTaskPayload(
  config: KwikConfig,
  quotePayload: KwikQuotePayload,
  quoteResponse: KwikJsonObject,
  billResponse: KwikJsonObject
): KwikCreateTaskPayload {
  const quoteData = dataObject(quoteResponse);
  const billData = dataObject(billResponse);

  const perTaskCost = integerNgnFromUnknown(quoteData.per_task_cost) ?? 0;
  const totalServiceCharge = integerNgnFromUnknown(quoteData.total_service_charge) ?? 0;
  const insuranceAmount = integerNgnFromUnknown(quoteData.insurance_amount) ?? 0;
  const totalNoOfTasks = numberFromUnknown(quoteData.total_no_of_tasks) ?? quotePayload.deliveries.length;
  const surgeCost = integerNgnFromUnknown(billData.SURGE_PRICING) ?? 0;
  const surgeType = numberFromUnknown(billData.SURGE_TYPE) ?? 0;

  const createPayload: KwikCreateTaskPayload = {
    domain_name: config.domainName,
    access_token: config.accessToken,
    vendor_id: config.vendorId,
    is_multiple_tasks: 1,
    fleet_id: "",
    latitude: 0,
    longitude: 0,
    timezone: config.timezoneOffsetMinutes,
    has_pickup: 1,
    has_delivery: 1,
    pickup_delivery_relationship: 0,
    layout_type: 0,
    auto_assignment: 1,
    team_id: "",
    pickups: quotePayload.pickups,
    deliveries: quotePayload.deliveries,
    insurance_amount: insuranceAmount,
    total_no_of_tasks: totalNoOfTasks,
    total_service_charge: totalServiceCharge,
    payment_method: config.paymentMethod,
    amount: String(perTaskCost),
    surge_cost: surgeCost,
    surge_type: surgeType,
    delivery_instruction: quotePayload.delivery_instruction,
    loaders_amount: quotePayload.loaders_amount,
    loaders_count: quotePayload.loaders_count,
    is_loader_required: quotePayload.is_loader_required,
    delivery_images: quotePayload.delivery_images,
    vehicle_id: quotePayload.vehicle_id,
    is_task_otp_required: quotePayload.deliveries[0]?.is_task_otp_required ?? 0,
  };

  if (config.serviceAreaId) {
    createPayload.sareaId = config.serviceAreaId;
  }

  return createPayload;
}
