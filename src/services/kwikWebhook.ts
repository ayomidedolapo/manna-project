// src/services/kwikWebhook.ts
import axios from "axios";
import https from "https";

const allowInsecureTls =
  (process.env.KWIK_INSECURE_TLS ?? "false").toLowerCase() === "true";

const httpsAgent = allowInsecureTls
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

let accessToken: string | null = null;
let accessTokenExpiry = 0;

let cookieHeader: string | null = null;
let cookieExpiry = 0;

type KwikApiResponse = Record<string, any>;

function lagosNowPlus(minutes: number) {
  const d = new Date(Date.now() + minutes * 60 * 1000);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get(
    "minute"
  )}:${get("second")}`;
}

function mustEnv(name: string, val: string | undefined) {
  if (!val) throw new Error(`Missing ${name} in .env`);
  return val;
}

function resetSession() {
  accessToken = null;
  accessTokenExpiry = 0;
  cookieHeader = null;
  cookieExpiry = 0;
}

function looksLikeCannotMethodText(x: any) {
  if (typeof x === "string") {
    return x.startsWith("Cannot ") || x.includes("Cannot POST") || x.includes("Cannot GET");
  }
  if (x && typeof x === "object") {
    const s = JSON.stringify(x);
    return s.includes("Cannot POST") || s.includes("Cannot GET") || s.includes("Cannot ");
  }
  return false;
}

async function loginWithEmailPassword(force = false) {
  const BASE = mustEnv("KWIK_BASE_URL", process.env.KWIK_BASE_URL);
  const DOMAIN_NAME = mustEnv("KWIK_DOMAIN_NAME", process.env.KWIK_DOMAIN_NAME);
  const EMAIL = mustEnv("KWIK_EMAIL", process.env.KWIK_EMAIL);
  const PASSWORD = mustEnv("KWIK_PASSWORD", process.env.KWIK_PASSWORD);

  const now = Date.now();
  const tokenOk = accessToken && now < accessTokenExpiry;
  const cookieOk = cookieHeader && now < cookieExpiry;

  if (!force && tokenOk && cookieOk) return;

  const res = await axios.post(
    `${BASE}/vendor_login`,
    {
      domain_name: DOMAIN_NAME,
      email: EMAIL,
      password: PASSWORD,
      api_login: 1,
    },
    {
      validateStatus: () => true,
      httpsAgent,
    }
  );

  const body = res.data;

  const ok = body?.status === 200 || body?.status === 201;
  if (!ok) throw new Error(`KWIK vendor_login failed: ${JSON.stringify(body)}`);

  const token = body?.data?.access_token ?? body?.access_token ?? null;
  if (!token) {
    throw new Error(`KWIK vendor_login missing access_token: ${JSON.stringify(body)}`);
  }

  const setCookie = res.headers["set-cookie"];
  if (Array.isArray(setCookie) && setCookie.length > 0) {
    cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
    cookieExpiry = now + 25 * 60 * 1000;
  } else {
    cookieHeader = null;
    cookieExpiry = now + 5 * 60 * 1000;
  }

  accessToken = String(token);
  accessTokenExpiry = now + 25 * 60 * 1000;
}

async function kwikPost(path: string, body: any, retry = true): Promise<KwikApiResponse> {
  const BASE = mustEnv("KWIK_BASE_URL", process.env.KWIK_BASE_URL);
  const DOMAIN_NAME = mustEnv("KWIK_DOMAIN_NAME", process.env.KWIK_DOMAIN_NAME);

  await loginWithEmailPassword(false);

  const res = await axios.post(
    `${BASE}${path}`,
    {
      ...body,
      domain_name: DOMAIN_NAME,
      access_token: accessToken,
    },
    {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      validateStatus: () => true,
      httpsAgent,
    }
  );

  const data = res.data;

  if (data?.status === 101 && retry) {
    resetSession();
    await loginWithEmailPassword(true);
    return kwikPost(path, body, false);
  }

  return data;
}

async function kwikGet(path: string, params: any, retry = true): Promise<KwikApiResponse> {
  const BASE = mustEnv("KWIK_BASE_URL", process.env.KWIK_BASE_URL);
  const DOMAIN_NAME = mustEnv("KWIK_DOMAIN_NAME", process.env.KWIK_DOMAIN_NAME);

  await loginWithEmailPassword(false);

  const res = await axios.get(`${BASE}${path}`, {
    params: {
      ...params,
      domain_name: DOMAIN_NAME,
      access_token: accessToken,
    },
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    validateStatus: () => true,
    httpsAgent,
  });

  const data = res.data;

  if (data?.status === 101 && retry) {
    resetSession();
    await loginWithEmailPassword(true);
    return kwikGet(path, params, false);
  }

  return data;
}

// ✅ Call an absolute status-check URL returned by KWIK (job_status_check_link)
async function kwikGetAbsoluteUrl(url: string, retry = true): Promise<KwikApiResponse> {
  await loginWithEmailPassword(false);

  const res = await axios.get(url, {
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    validateStatus: () => true,
    httpsAgent,
  });

  const data = res.data;

  if (data?.status === 101 && retry) {
    resetSession();
    await loginWithEmailPassword(true);
    return kwikGetAbsoluteUrl(url, false);
  }

  return data;
}

function normalizeJobStatus(res: any) {
  const payload = res?.data ?? res ?? {};

  const jobStatusRaw =
    payload.job_status ??
    payload.jobStatus ??
    payload.status ??
    payload.job?.job_status ??
    payload.job?.status ??
    payload.data?.job_status ??
    null;

  const job_status = Number(jobStatusRaw);
  if (!Number.isFinite(job_status)) return null;

  const unique_order_id =
    payload.unique_order_id ??
    payload.uniqueOrderId ??
    payload.job?.unique_order_id ??
    payload.job?.uniqueOrderId ??
    payload.data?.unique_order_id ??
    null;

  const tracking_url =
    payload.result_tracking_link ??
    payload.tracking_url ??
    payload.trackingUrl ??
    payload.tracking?.url ??
    payload.job?.result_tracking_link ??
    payload.job?.tracking_url ??
    payload.data?.result_tracking_link ??
    null;

  return {
    job_status,
    unique_order_id: unique_order_id != null ? String(unique_order_id) : null,
    tracking_url: tracking_url != null ? String(tracking_url) : null,
  };
}

/**
 * ✅ Now supports preferred polling via KWIK-provided statusCheckUrl.
 */
export async function getKwikJobStatus(args: { jobId: string; statusCheckUrl?: string | null }) {
  const { jobId, statusCheckUrl } = args;
  if (!jobId) throw new Error("jobId is required");

  if (statusCheckUrl) {
    const res = await kwikGetAbsoluteUrl(statusCheckUrl);
    if (!looksLikeCannotMethodText(res)) {
      const norm = normalizeJobStatus(res);
      if (norm) return { ...norm, raw: res, usedEndpoint: `GET ${statusCheckUrl}` };
    }
  }

  const candidates: Array<{ method: "GET" | "POST"; path: string }> = [
    { method: "GET", path: "/task_status" },
    { method: "GET", path: "/job_status" },
    { method: "GET", path: "/get_task_status" },
    { method: "GET", path: "/get_job_status" },
    { method: "POST", path: "/task_status" },
    { method: "POST", path: "/job_status" },
    { method: "POST", path: "/get_task_status" },
    { method: "POST", path: "/get_job_status" },
  ];

  const errors: string[] = [];

  for (const c of candidates) {
    const res =
      c.method === "GET"
        ? await kwikGet(c.path, { job_id: jobId }).catch((e) => {
            errors.push(`${c.method} ${c.path} threw: ${e?.message ?? e}`);
            return null;
          })
        : await kwikPost(c.path, { job_id: jobId }).catch((e) => {
            errors.push(`${c.method} ${c.path} threw: ${e?.message ?? e}`);
            return null;
          });

    if (!res) continue;

    if (looksLikeCannotMethodText(res)) {
      errors.push(`${c.method} ${c.path} not allowed: ${String(res).trim()}`);
      continue;
    }

    if (res?.status !== 200) {
      errors.push(`${c.method} ${c.path} failed: ${JSON.stringify(res)}`);
      continue;
    }

    const norm = normalizeJobStatus(res);
    if (!norm) {
      errors.push(`${c.method} ${c.path} missing job_status`);
      continue;
    }

    return { ...norm, raw: res, usedEndpoint: `${c.method} ${c.path}` };
  }

  throw new Error(`KWIK status check failed. Tried: ${errors.join(" | ")}`);
}

export async function createKwikDelivery(order: {
  orderId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  state: string;
  deliveryLat: number;
  deliveryLng: number;
  amountNgn?: number;
  vehicleId: number; // ✅ dynamic (bike/suv/van)
}) {
  const vendorId = Number(mustEnv("KWIK_VENDOR_ID", process.env.KWIK_VENDOR_ID));
  const paymentMethod = Number(mustEnv("KWIK_PAYMENT_METHOD", process.env.KWIK_PAYMENT_METHOD));
  const timezone = Number(mustEnv("KWIK_TIMEZONE", process.env.KWIK_TIMEZONE));
  const sareaId = String(mustEnv("KWIK_SAREA_ID", process.env.KWIK_SAREA_ID));
  const formId = Number(mustEnv("KWIK_FORM_ID", process.env.KWIK_FORM_ID));
  const userId = Number(mustEnv("KWIK_USER_ID", process.env.KWIK_USER_ID));
  const teamIdRaw = process.env.KWIK_TEAM_ID;

  if (!Number.isFinite(order.vehicleId) || order.vehicleId <= 0) {
    throw new Error(`Invalid vehicleId passed to KWIK: ${order.vehicleId}`);
  }

  const whAddress = mustEnv("WAREHOUSE_ADDRESS", process.env.WAREHOUSE_ADDRESS);
  const whLat = Number(process.env.WAREHOUSE_LAT);
  const whLng = Number(process.env.WAREHOUSE_LNG);

  if (!Number.isFinite(whLat) || !Number.isFinite(whLng)) throw new Error("Invalid WAREHOUSE_LAT/LNG");
  if (!Number.isFinite(order.deliveryLat) || !Number.isFinite(order.deliveryLng)) {
    throw new Error("deliveryLat/deliveryLng are required");
  }

  const time = lagosNowPlus(10);

  const pickups = [
    {
      address: whAddress,
      name: "Manna Warehouse",
      latitude: whLat,
      longitude: whLng,
      time,
      phone: process.env.WAREHOUSE_PHONE ?? order.customerPhone,
      email: process.env.COMPANY_EMAIL ?? "",
    },
  ];

  const deliveries = [
    {
      address: `${order.address}, ${order.city}, ${order.state}`,
      name: order.customerName,
      latitude: order.deliveryLat,
      longitude: order.deliveryLng,
      time,
      phone: order.customerPhone,
      email: "",
      has_return_task: false,
      is_package_insured: 0,
      is_task_otp_required: 0,
    },
  ];

  const pay = await kwikPost(`/send_payment_for_task`, {
    vendor_id: vendorId,
    user_id: userId,
    form_id: formId,
    auto_assignment: 1,
    layout_type: 0,
    has_pickup: 1,
    has_delivery: 1,
    is_multiple_tasks: 1,
    is_schedule_task: 0,
    payment_method: paymentMethod,
    vehicle_id: order.vehicleId, // ✅ use dynamic vehicle
    pickups,
    deliveries,
    is_loader_required: 0,
    loaders_amount: 0,
    loaders_count: 0,
    delivery_instruction: "",
    delivery_images: "",
    is_cod_job: 0,
    parcel_amount: 0,
  });

  if (pay?.status !== 200) {
    throw new Error(`KWIK send_payment_for_task failed: ${JSON.stringify(pay)}`);
  }

  const perTaskCostRaw = pay?.data?.per_task_cost ?? pay?.per_task_cost ?? null;
  const perTaskCost = perTaskCostRaw != null ? String(perTaskCostRaw) : "";
  if (!perTaskCost) throw new Error(`Missing per_task_cost: ${JSON.stringify(pay)}`);

  const bill = await kwikPost(`/get_bill_breakdown`, {
    user_id: userId,
    form_id: formId,
    amount: perTaskCost,
    insurance_amount: pay?.data?.insurance_amount ?? 0,
    total_no_of_tasks: pay?.data?.total_no_of_tasks ?? 1,
    total_service_charge: pay?.data?.total_service_charge ?? 0,
    credits: 0,
    promo_value: null,
    benefit_type: null,
    is_loader_required: pay?.data?.is_loader_required ?? 0,
    loaders_amount: pay?.data?.loaders_amount ?? 0,
    loaders_count: pay?.data?.loaders_count ?? 0,
    delivery_instruction: pay?.data?.delivery_instruction ?? "",
    vehicle_id: order.vehicleId,
    delivery_images: pay?.data?.delivery_images ?? "",
    is_cod_job: 0,
    parcel_amount: 0,
    delivery_charge_by_buyer: 1,
  });

  const surgeCost = bill?.data?.SURGE_PRICING ?? 0;
  const surgeType = bill?.data?.SURGE_TYPE ?? 0;

  const create = await kwikPost(`/create_task_via_vendor`, {
    vendor_id: vendorId,
    is_multiple_tasks: 1,
    timezone,
    has_pickup: 1,
    has_delivery: 1,
    layout_type: 0,
    auto_assignment: 1,
    ...(teamIdRaw ? { team_id: Number(teamIdRaw) } : {}), // ✅ don't send "" (KWIK can reject)
    pickups,
    deliveries,
    insurance_amount: pay?.data?.insurance_amount ?? 0,
    total_no_of_tasks: pay?.data?.total_no_of_tasks ?? 1,
    total_service_charge: pay?.data?.total_service_charge ?? 0,
    payment_method: paymentMethod,
    amount: perTaskCost,
    is_loader_required: pay?.data?.is_loader_required ?? 0,
    loaders_amount: pay?.data?.loaders_amount ?? 0,
    loaders_count: pay?.data?.loaders_count ?? 0,
    delivery_instruction: pay?.data?.delivery_instruction ?? "",
    vehicle_id: order.vehicleId,
    delivery_images: pay?.data?.delivery_images ?? "",
    surge_cost: surgeCost,
    surge_type: surgeType,
    sareaId,
    unique_order_id: order.orderId,
  });

  if (create?.status !== 200) {
    throw new Error(`KWIK create_task_via_vendor failed: ${JSON.stringify(create)}`);
  }

  const pickupJobId = create?.data?.pickups?.[0]?.job_id ?? null;
  const deliveryJobId = create?.data?.deliveries?.[0]?.job_id ?? null;
  const taskId = deliveryJobId ?? pickupJobId;

  const trackingUrl =
    create?.data?.deliveries?.[0]?.result_tracking_link ??
    create?.data?.pickups?.[0]?.result_tracking_link ??
    null;

  if (!taskId) throw new Error(`Missing job_id: ${JSON.stringify(create)}`);

  return {
    taskId: String(taskId),
    trackingUrl,
    raw: create,
    perTaskCost,
    otp: create?.data?.task_otp?.[0]?.job_otp ?? null,
    uniqueOrderId: create?.data?.unique_order_id ?? null,
    statusCheckUrl: create?.data?.job_status_check_link ?? null,
  };
}
