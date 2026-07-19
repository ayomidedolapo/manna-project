export const VENDOR_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "UNDER_REVIEW",
  "APPROVED",
  "SUSPENDED",
  "REJECTED",
] as const;

export type VendorStatusValue = (typeof VENDOR_STATUSES)[number];

export const PRODUCT_APPROVAL_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
] as const;

export type ProductApprovalStatusValue =
  (typeof PRODUCT_APPROVAL_STATUSES)[number];

export function isVendorStatus(value: string): value is VendorStatusValue {
  return VENDOR_STATUSES.includes(value as VendorStatusValue);
}

export function isProductApprovalStatus(
  value: string
): value is ProductApprovalStatusValue {
  return PRODUCT_APPROVAL_STATUSES.includes(
    value as ProductApprovalStatusValue
  );
}
