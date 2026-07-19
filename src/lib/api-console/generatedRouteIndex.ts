/**
 * AUTO-GENERATED FILE.
 * Run: npm run api:sync
 * Do not manually edit this file.
 */

export type GeneratedApiMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type GeneratedApiRoute = {
  method: GeneratedApiMethod;
  path: string;
  sourceFile: string;
};

export const generatedApiRoutes: GeneratedApiRoute[] = [
  {
    "method": "POST",
    "path": "/api/admin/deliveries/[deliveryId]/dispatch",
    "sourceFile": "src/app/api/admin/deliveries/[deliveryId]/dispatch/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/discounts",
    "sourceFile": "src/app/api/admin/discounts/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/discounts",
    "sourceFile": "src/app/api/admin/discounts/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/discounts/[id]",
    "sourceFile": "src/app/api/admin/discounts/[id]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/discounts/[id]/toggle",
    "sourceFile": "src/app/api/admin/discounts/[id]/toggle/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/feedback",
    "sourceFile": "src/app/api/admin/feedback/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/market-clusters",
    "sourceFile": "src/app/api/admin/market-clusters/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/market-clusters",
    "sourceFile": "src/app/api/admin/market-clusters/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/market-clusters/[id]",
    "sourceFile": "src/app/api/admin/market-clusters/[id]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/market-clusters/[id]",
    "sourceFile": "src/app/api/admin/market-clusters/[id]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/notifications",
    "sourceFile": "src/app/api/admin/notifications/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/notifications",
    "sourceFile": "src/app/api/admin/notifications/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/notifications/broadcast",
    "sourceFile": "src/app/api/admin/notifications/broadcast/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/orders",
    "sourceFile": "src/app/api/admin/orders/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/orders/[id]/delivery/kwik/create-task",
    "sourceFile": "src/app/api/admin/orders/[id]/delivery/kwik/create-task/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/orders/[id]/delivery/kwik/dispatch-ready",
    "sourceFile": "src/app/api/admin/orders/[id]/delivery/kwik/dispatch-ready/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/orders/[id]/settlements",
    "sourceFile": "src/app/api/admin/orders/[id]/settlements/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/orders/[id]/settlements/generate",
    "sourceFile": "src/app/api/admin/orders/[id]/settlements/generate/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/orders/[id]/vendor-readiness",
    "sourceFile": "src/app/api/admin/orders/[id]/vendor-readiness/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/products",
    "sourceFile": "src/app/api/admin/products/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/products",
    "sourceFile": "src/app/api/admin/products/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/products/[id]",
    "sourceFile": "src/app/api/admin/products/[id]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/products/[id]",
    "sourceFile": "src/app/api/admin/products/[id]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/products/[id]/variants",
    "sourceFile": "src/app/api/admin/products/[id]/variants/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/products/[id]/variants/[variantId]",
    "sourceFile": "src/app/api/admin/products/[id]/variants/[variantId]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/products/[id]/variants/[variantId]",
    "sourceFile": "src/app/api/admin/products/[id]/variants/[variantId]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/test/delivery/from-order",
    "sourceFile": "src/app/api/admin/test/delivery/from-order/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/vendors",
    "sourceFile": "src/app/api/admin/vendors/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/vendors",
    "sourceFile": "src/app/api/admin/vendors/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/vendors/[id]",
    "sourceFile": "src/app/api/admin/vendors/[id]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/vendors/[id]",
    "sourceFile": "src/app/api/admin/vendors/[id]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/login",
    "sourceFile": "src/app/api/auth/login/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/auth/me",
    "sourceFile": "src/app/api/auth/me/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/oauth/apple/callback",
    "sourceFile": "src/app/api/auth/oauth/apple/callback/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/auth/oauth/apple/start",
    "sourceFile": "src/app/api/auth/oauth/apple/start/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/auth/oauth/google/callback",
    "sourceFile": "src/app/api/auth/oauth/google/callback/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/auth/oauth/google/start",
    "sourceFile": "src/app/api/auth/oauth/google/start/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/register",
    "sourceFile": "src/app/api/auth/register/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/checkout",
    "sourceFile": "src/app/api/checkout/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/checkout/delivery-quote",
    "sourceFile": "src/app/api/checkout/delivery-quote/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/checkout/initialize",
    "sourceFile": "src/app/api/checkout/initialize/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/checkout/preview",
    "sourceFile": "src/app/api/checkout/preview/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/cron/kwik-status-sync",
    "sourceFile": "src/app/api/cron/kwik-status-sync/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/cron/kwik-status-sync",
    "sourceFile": "src/app/api/cron/kwik-status-sync/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/cron/kwik-sync",
    "sourceFile": "src/app/api/cron/kwik-sync/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/debug/env",
    "sourceFile": "src/app/api/debug/env/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/deliveries/[id]/kwik/sync",
    "sourceFile": "src/app/api/deliveries/[id]/kwik/sync/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/discounts/active",
    "sourceFile": "src/app/api/discounts/active/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/internal/order/[orderid]/create-delivery",
    "sourceFile": "src/app/api/internal/order/[orderid]/create-delivery/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/me/cart/items",
    "sourceFile": "src/app/api/me/cart/items/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/me/cart/items/[id]",
    "sourceFile": "src/app/api/me/cart/items/[id]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/me/cart/items/[id]",
    "sourceFile": "src/app/api/me/cart/items/[id]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/me/cart/summary",
    "sourceFile": "src/app/api/me/cart/summary/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/me/dashboard",
    "sourceFile": "src/app/api/me/dashboard/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/notifications",
    "sourceFile": "src/app/api/notifications/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/notifications/[id]/read",
    "sourceFile": "src/app/api/notifications/[id]/read/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/notifications/device-tokens",
    "sourceFile": "src/app/api/notifications/device-tokens/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/notifications/device-tokens",
    "sourceFile": "src/app/api/notifications/device-tokens/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/notifications/mark-all-read",
    "sourceFile": "src/app/api/notifications/mark-all-read/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/notifications/preferences",
    "sourceFile": "src/app/api/notifications/preferences/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/notifications/preferences",
    "sourceFile": "src/app/api/notifications/preferences/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/orders",
    "sourceFile": "src/app/api/orders/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/orders/[id]",
    "sourceFile": "src/app/api/orders/[id]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/orders/[id]/cancel",
    "sourceFile": "src/app/api/orders/[id]/cancel/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/orders/[id]/delivery/resync",
    "sourceFile": "src/app/api/orders/[id]/delivery/resync/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/orders/[id]/feedback",
    "sourceFile": "src/app/api/orders/[id]/feedback/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/orders/[id]/feedback",
    "sourceFile": "src/app/api/orders/[id]/feedback/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/orders/[id]/invoice",
    "sourceFile": "src/app/api/orders/[id]/invoice/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/orders/[id]/invoice.pdf",
    "sourceFile": "src/app/api/orders/[id]/invoice.pdf/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/orders/[id]/receipt/email",
    "sourceFile": "src/app/api/orders/[id]/receipt/email/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/orders/[id]/status",
    "sourceFile": "src/app/api/orders/[id]/status/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/orders/[id]/tracking",
    "sourceFile": "src/app/api/orders/[id]/tracking/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/payments/confirm",
    "sourceFile": "src/app/api/payments/confirm/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/payments/initialize",
    "sourceFile": "src/app/api/payments/initialize/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/products",
    "sourceFile": "src/app/api/products/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/products/[slug]",
    "sourceFile": "src/app/api/products/[slug]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/vendors",
    "sourceFile": "src/app/api/vendors/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/vendors/notifications",
    "sourceFile": "src/app/api/vendors/notifications/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/vendors/notifications",
    "sourceFile": "src/app/api/vendors/notifications/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/vendors/orders",
    "sourceFile": "src/app/api/vendors/orders/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/vendors/orders/[id]/ready",
    "sourceFile": "src/app/api/vendors/orders/[id]/ready/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/vendors/register",
    "sourceFile": "src/app/api/vendors/register/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/vendors/settlements",
    "sourceFile": "src/app/api/vendors/settlements/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/kwik",
    "sourceFile": "src/app/api/webhooks/kwik/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/payment",
    "sourceFile": "src/app/api/webhooks/payment/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/paystack",
    "sourceFile": "src/app/api/webhooks/paystack/route.ts"
  }
];
