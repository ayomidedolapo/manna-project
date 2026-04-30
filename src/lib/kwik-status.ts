export type DeliveryStatus =
  | "CREATED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PROCESSING"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

/**
 * KWIK docs job statuses:
 * UPCOMING 0, STARTED 1, ENDED 2, FAILED 3, ARRIVED 4,
 * UNASSIGNED 6, ACCEPTED 7, DECLINE 8, CANCEL 9, Deleted 10
 */
export function mapKwikStatusToDeliveryStatus(jobStatus: number): DeliveryStatus {
  switch (jobStatus) {
    case 7: // ACCEPTED
    case 0: // UPCOMING
      return "ASSIGNED";
    case 1: // STARTED
    case 4: // ARRIVED
      return "IN_TRANSIT";
    case 2: // ENDED
      return "DELIVERED";
    case 3: // FAILED
      return "FAILED";
    case 9: // CANCEL
    case 10: // Deleted
      return "CANCELLED";
    case 6: // UNASSIGNED
    case 8: // DECLINE
    default:
      return "CREATED";
  }
}

// Forward-only guard (prevents regression)
const DELIVERY_RANK: Record<DeliveryStatus, number> = {
  CREATED: 1,
  ASSIGNED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  FAILED: 90,
  CANCELLED: 91,
};

export function canMoveForward(current: DeliveryStatus, next: DeliveryStatus) {
  if (current === "DELIVERED" || current === "FAILED" || current === "CANCELLED") return false;
  return DELIVERY_RANK[next] >= DELIVERY_RANK[current];
}

// retry schedule: 1,3,7,15,30,60 mins cap
export function computeNextCheck(attempt: number) {
  const mins = [1, 3, 7, 15, 30, 60][Math.min(attempt, 5)];
  return new Date(Date.now() + mins * 60 * 1000);
}
