export type KwikJsonObject = Record<string, unknown>;

export type KwikStop = {
  address: string;
  name: string;
  latitude: number;
  longitude: number;
  time: string;
  phone: string;
  email?: string;
};

export type KwikDeliveryStop = KwikStop & {
  has_return_task: false;
  is_package_insured: 0 | 1;
  hadVairablePayment: 0 | 1;
  hadFixedPayment: 0 | 1;
  is_task_otp_required?: 0 | 1;
};

export type KwikQuotePayload = {
  custom_field_template: string;
  access_token: string;
  domain_name: string;
  timezone: number;
  vendor_id: number;
  is_multiple_tasks: 1;
  layout_type: 0;
  pickup_custom_field_template: string;
  deliveries: KwikDeliveryStop[];
  has_pickup: 1;
  has_delivery: 1;
  auto_assignment: 1;
  user_id: number;
  pickups: KwikStop[];
  payment_method: number;
  form_id: number;
  vehicle_id: number;
  delivery_instruction: string;
  delivery_images: string;
  is_loader_required: 0 | 1;
  loaders_amount: number;
  loaders_count: number;
  is_cod_job: 0 | 1;
  parcel_amount?: number;
};

export type KwikBillBreakdownPayload = {
  access_token: string;
  benefit_type: null;
  amount: string;
  insurance_amount: number;
  total_no_of_tasks: number;
  pickup_time: string;
  user_id: number;
  form_id: number;
  promo_value: null;
  domain_name: string;
  credits: 0;
  total_service_charge: number;
  vehicle_id: number;
  delivery_images: string;
  is_loader_required: 0 | 1;
  loaders_amount: number;
  loaders_count: number;
  is_cod_job: 0 | 1;
  parcel_amount?: number;
  delivery_charge_by_buyer: 0 | 1 | 2;
  delivery_instruction: string;
};

export type KwikCreateTaskPayload = {
  domain_name: string;
  access_token: string;
  vendor_id: number;
  is_multiple_tasks: 1;
  fleet_id: string;
  latitude: 0;
  longitude: 0;
  timezone: number;
  has_pickup: 1;
  has_delivery: 1;
  pickup_delivery_relationship: 0;
  layout_type: 0;
  auto_assignment: 1;
  team_id: string;
  pickups: KwikStop[];
  deliveries: KwikDeliveryStop[];
  insurance_amount: number;
  total_no_of_tasks: number;
  total_service_charge: number;
  payment_method: number;
  amount: string;
  surge_cost: number;
  surge_type: number;
  delivery_instruction: string;
  loaders_amount: number;
  loaders_count: number;
  is_loader_required: 0 | 1;
  delivery_images: string;
  vehicle_id: number;
  is_task_otp_required: 0 | 1;
  sareaId?: string;
};

export type KwikConfig = {
  baseUrl: string;
  domainName: string;
  accessToken: string;
  vendorId: number;
  userId: number;
  formId: number;
  paymentMethod: number;
  timezoneOffsetMinutes: number;
  customFieldTemplate: string;
  defaultVehicleId: number;
  defaultVehicleName: string;
  quoteTtlMinutes: number;
  requestTimeoutMs: number;
  serviceAreaId?: string;
};

export type KwikQuoteResult = {
  quotePayload: KwikQuotePayload;
  quoteResponse: KwikJsonObject;
  billPayload: KwikBillBreakdownPayload;
  billResponse: KwikJsonObject;
  pickupCount: number;
  deliveryCount: number;
  amountToChargeCustomerNgn: number;
  kwikPerTaskCostNgn: number | null;
  kwikTotalServiceChargeNgn: number | null;
  kwikPayableAmountNgn: number | null;
  kwikNetPayableAmountNgn: number | null;
  kwikDeliveryChargeNgn: number | null;
  kwikSurgeCostNgn: number | null;
  kwikSurgeType: number | null;
  kwikVehicleId: number;
  kwikVehicleName: string;
};

export type KwikCreateTaskResult = {
  createPayload: KwikCreateTaskPayload;
  createResponse: KwikJsonObject;
  kwikUniqueOrderId: string | null;
  kwikPickupJobIds: number[];
  kwikDeliveryJobIds: number[];
  kwikJobToken: string | null;
  kwikStatusCheckUrl: string | null;
  kwikTrackingLinks: string[];
};
