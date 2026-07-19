export type KwikJobStatusSnapshot = {
  jobId?: string | number;
  jobType?: number;
  jobStatus?: number;
  address?: string;
};

export type MannaKwikStatusSummary = {
  deliveryStatus: "CREATED" | "ASSIGNED" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED" | "FAILED" | "CANCELLED";
  orderStatus: "PROCESSING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  processingStatus: "DISPATCHED" | "DELIVERED" | "FAILED" | "CANCELLED";
  isTerminal: boolean;
  shouldGenerateSettlement: boolean;
  nextCheckDelayMinutes: number | null;
};

const DELIVERY_STARTED_STATUSES = new Set([1, 4]);
const ASSIGNED_STATUSES = new Set([0, 7]);

function isDeliveryJob(job: KwikJobStatusSnapshot): boolean {
  return job.jobType === 1;
}

function getStatusCodes(jobs: KwikJobStatusSnapshot[]): number[] {
  return jobs
    .map((job) => job.jobStatus)
    .filter((status): status is number => typeof status === "number");
}

export function mapKwikJobsToMannaStatus(
  jobs: KwikJobStatusSnapshot[]
): MannaKwikStatusSummary {
  const statusCodes = getStatusCodes(jobs);
  const deliveryStatusCodes = getStatusCodes(jobs.filter(isDeliveryJob));

  if (statusCodes.some((status) => status === 9 || status === 10)) {
    return {
      deliveryStatus: "CANCELLED",
      orderStatus: "CANCELLED",
      processingStatus: "CANCELLED",
      isTerminal: true,
      shouldGenerateSettlement: false,
      nextCheckDelayMinutes: null,
    };
  }

  if (statusCodes.some((status) => status === 3)) {
    return {
      deliveryStatus: "FAILED",
      orderStatus: "PROCESSING",
      processingStatus: "FAILED",
      isTerminal: true,
      shouldGenerateSettlement: false,
      nextCheckDelayMinutes: null,
    };
  }

  if (
    deliveryStatusCodes.length > 0 &&
    deliveryStatusCodes.every((status) => status === 2)
  ) {
    return {
      deliveryStatus: "DELIVERED",
      orderStatus: "DELIVERED",
      processingStatus: "DELIVERED",
      isTerminal: true,
      shouldGenerateSettlement: true,
      nextCheckDelayMinutes: null,
    };
  }

  if (deliveryStatusCodes.some((status) => DELIVERY_STARTED_STATUSES.has(status))) {
    return {
      deliveryStatus: "IN_TRANSIT",
      orderStatus: "OUT_FOR_DELIVERY",
      processingStatus: "DISPATCHED",
      isTerminal: false,
      shouldGenerateSettlement: false,
      nextCheckDelayMinutes: 5,
    };
  }

  if (statusCodes.some((status) => status === 2)) {
    return {
      deliveryStatus: "PICKED_UP",
      orderStatus: "OUT_FOR_DELIVERY",
      processingStatus: "DISPATCHED",
      isTerminal: false,
      shouldGenerateSettlement: false,
      nextCheckDelayMinutes: 5,
    };
  }

  if (statusCodes.some((status) => ASSIGNED_STATUSES.has(status))) {
    return {
      deliveryStatus: "ASSIGNED",
      orderStatus: "PROCESSING",
      processingStatus: "DISPATCHED",
      isTerminal: false,
      shouldGenerateSettlement: false,
      nextCheckDelayMinutes: 10,
    };
  }

  return {
    deliveryStatus: "CREATED",
    orderStatus: "PROCESSING",
    processingStatus: "DISPATCHED",
    isTerminal: false,
    shouldGenerateSettlement: false,
    nextCheckDelayMinutes: 10,
  };
}
