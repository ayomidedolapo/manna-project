// src/lib/api-console/routeRegistry.ts

import { generatedApiRoutes } from "./generatedRouteIndex";
export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type RouteSafety =
  | "SAFE_READ"
  | "CONTROLLED_ACTION"
  | "RESTRICTED_SYSTEM";

export type DocumentationStatus = "VERIFIED" | "SOURCE_REVIEW_REQUIRED";

export type ApiRouteDefinition = {
  id: string;
  module: string;
  title: string;
  method: ApiMethod;
  path: string;
  sourceFile: string;
  auth: string;
  safety: RouteSafety;
  documentationStatus: DocumentationStatus;
  description: string;
  usage: string;
  pathParams?: Array<{
    name: string;
    description: string;
    example: string;
  }>;
  requestExample?: unknown;
  responseExample?: unknown;
  notes: string[];
};

type UnreviewedRouteInput = Omit<
  ApiRouteDefinition,
  "documentationStatus" | "description" | "usage" | "notes"
> & {
  description?: string;
  usage?: string;
  notes?: string[];
};

function needsSourceReview(input: UnreviewedRouteInput): ApiRouteDefinition {
  return {
    ...input,
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description:
      input.description ??
      "This endpoint was discovered from the Manna backend route tree. Its exact handler behaviour still needs source-code verification.",
    usage:
      input.usage ??
      "Read the source route before enabling execution or documenting business-critical behaviour.",
    notes: input.notes ?? [
      "Route is indexed from the source tree.",
      "Exact request/response behaviour requires handler review.",
    ],
  };
}

const documentedMannaApiRoutes: ApiRouteDefinition[] = [
  // =========================================================
  // AUTHENTICATION
  // =========================================================
  {
    id: "auth-login-post",
    module: "Authentication",
    title: "Sign In",
    method: "POST",
    path: "/api/auth/login",
    sourceFile: "src/app/api/auth/login/route.ts",
    auth: "Public",
    safety: "CONTROLLED_ACTION",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Authenticates a Manna user and establishes the application session.",
    usage: "Use from the Manna login interface. Do not use the console to test real credentials in production.",
    requestExample: {
      email: "admin@manna.com",
      password: "your-password",
    },
    notes: [
      "Likely creates the manna_token cookie used by protected routes.",
      "Keep test credentials out of execution logs.",
    ],
  },
  {
    id: "auth-register-post",
    module: "Authentication",
    title: "Register User",
    method: "POST",
    path: "/api/auth/register",
    sourceFile: "src/app/api/auth/register/route.ts",
    auth: "Public",
    safety: "CONTROLLED_ACTION",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Registers a new Manna customer account.",
    usage: "Use from the customer registration flow.",
    notes: [
      "Needs source review for required registration fields.",
      "Should not be executed casually against production.",
    ],
  },
  {
    id: "auth-me-get",
    module: "Authentication",
    title: "Get Current Session User",
    method: "GET",
    path: "/api/auth/me",
    sourceFile: "src/app/api/auth/me/route.ts",
    auth: "Authenticated user",
    safety: "SAFE_READ",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Returns information about the current authenticated user/session.",
    usage: "Useful for session validation and admin-console access checks.",
    notes: ["Expected to use the manna_token cookie."],
  },

  // =========================================================
  // CATALOGUE
  // =========================================================
  {
    id: "products-list-get",
    module: "Catalogue",
    title: "List Products",
    method: "GET",
    path: "/api/products",
    sourceFile: "src/app/api/products/route.ts",
    auth: "Public or authenticated user",
    safety: "SAFE_READ",
    documentationStatus: "VERIFIED",
    description: "Returns active products, their variants, and the current applicable discount view.",
    usage: "Used by public product listing, browsing, and search interfaces.",
    notes: [
      "Public read-only route; it does not write application data.",
      "Products are ordered featured-first, then newest-first.",
    ],
  },
  {
    id: "products-detail-get",
    module: "Catalogue",
    title: "Get Product by Slug",
    method: "GET",
    path: "/api/products/[slug]",
    sourceFile: "src/app/api/products/[slug]/route.ts",
    auth: "Public or authenticated user",
    safety: "SAFE_READ",
    documentationStatus: "VERIFIED",
    description: "Returns one active product by slug, its variants, and the current discount summary.",
    usage: "Used by public product-detail pages.",
    pathParams: [
      {
        name: "slug",
        description: "Product slug.",
        example: "fresh-tomatoes",
      },
    ],
    notes: [
      "Public read-only route; inactive or missing products return 404.",
      "Discounted and original variant prices are returned together.",
    ],
  },
  {
    id: "discounts-active-get",
    module: "Catalogue",
    title: "List Active Discounts",
    method: "GET",
    path: "/api/discounts/active",
    sourceFile: "src/app/api/discounts/active/route.ts",
    auth: "Public or authenticated user",
    safety: "SAFE_READ",
    documentationStatus: "VERIFIED",
    description: "Returns the active discount set, or the active discount for an optional productId query parameter.",
    usage: "Used by catalogue, cart, and checkout pricing displays.",
    notes: [
      "Public read-only route; it does not write application data.",
      "When productId is supplied, the response contains one eligible active discount or null.",
    ],
  },

  // =========================================================
  // CART & CUSTOMER
  // =========================================================
  {
    id: "cart-add-item-post",
    module: "Cart & Customer",
    title: "Add Cart Item",
    method: "POST",
    path: "/api/me/cart/items",
    sourceFile: "src/app/api/me/cart/items/route.ts",
    auth: "Customer",
    safety: "CONTROLLED_ACTION",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Adds a product or product variant to the authenticated user's persistent cart.",
    usage: "Used by the Add to Cart action.",
    requestExample: {
      productId: "uuid",
      productVariantId: "uuid",
      quantity: 1,
    },
    notes: ["Confirm whether productVariantId is optional."],
  },
  needsSourceReview({
    id: "cart-item-update-patch",
    module: "Cart & Customer",
    title: "Update Cart Item",
    method: "PATCH",
    path: "/api/me/cart/items/[id]",
    sourceFile: "src/app/api/me/cart/items/[id]/route.ts",
    auth: "Customer",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Cart item UUID.", example: "uuid" }],
    description: "Updates a specific authenticated customer's cart item.",
    usage: "Requires source review before console execution is approved.",
  }),
  needsSourceReview({
    id: "cart-item-delete",
    module: "Cart & Customer",
    title: "Remove Cart Item",
    method: "DELETE",
    path: "/api/me/cart/items/[id]",
    sourceFile: "src/app/api/me/cart/items/[id]/route.ts",
    auth: "Customer",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Cart item UUID.", example: "uuid" }],
    description: "Removes a specific authenticated customer's cart item.",
    usage: "Requires source review before console execution is approved.",
  }),
  {
    id: "cart-summary-get",
    module: "Cart & Customer",
    title: "Get Cart Summary",
    method: "GET",
    path: "/api/me/cart/summary",
    sourceFile: "src/app/api/me/cart/summary/route.ts",
    auth: "Customer",
    safety: "SAFE_READ",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Returns the authenticated user's cart totals and item summary.",
    usage: "Used by cart and checkout screens.",
    notes: [],
  },
  {
    id: "customer-dashboard-get",
    module: "Cart & Customer",
    title: "Get Customer Dashboard",
    method: "GET",
    path: "/api/me/dashboard",
    sourceFile: "src/app/api/me/dashboard/route.ts",
    auth: "Customer",
    safety: "SAFE_READ",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Returns data needed for the signed-in customer's dashboard.",
    usage: "Used by the customer account homepage.",
    notes: [],
  },

  // =========================================================
  // CHECKOUT & PAYMENTS
  // =========================================================
  {
    id: "checkout-post",
    module: "Checkout & Payments",
    title: "Checkout",
    method: "POST",
    path: "/api/checkout",
    sourceFile: "src/app/api/checkout/route.ts",
    auth: "Customer",
    safety: "CONTROLLED_ACTION",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Checkout endpoint discovered in the Manna route tree.",
    usage: "Review against checkout/initialize to determine its current production role.",
    notes: [
      "There are multiple checkout routes in the project.",
      "This must be source-reviewed before console execution is enabled.",
    ],
  },
  {
    id: "checkout-initialize-post",
    module: "Checkout & Payments",
    title: "Initialize Checkout Order",
    method: "POST",
    path: "/api/checkout/initialize",
    sourceFile: "src/app/api/checkout/initialize/route.ts",
    auth: "Customer",
    safety: "CONTROLLED_ACTION",
    documentationStatus: "VERIFIED",
    description: "Creates a pending Manna order using selected items and delivery details before payment is initialized.",
    usage: "Customer checkout flow. Creates an order with PENDING_PAYMENT and PENDING payment state.",
    requestExample: {
      items: [
        {
          productId: "uuid",
          variantId: "uuid",
          quantity: 1,
        },
      ],
      deliveryAddress1: "12 Example Street",
      deliveryAddress2: "",
      city: "Lagos",
      state: "Lagos",
      deliveryNote: "Call before arrival",
      deliveryLat: 6.5244,
      deliveryLng: 3.3792,
    },
    notes: [
      "variantId must be a real ProductVariant UUID when a variant is required.",
      "deliveryLat and deliveryLng are required for KWIK routing.",
      "Do not run against production unless you intend to create a real order.",
    ],
  },
  {
    id: "checkout-preview-post",
    module: "Checkout & Payments",
    title: "Preview Checkout",
    method: "POST",
    path: "/api/checkout/preview",
    sourceFile: "src/app/api/checkout/preview/route.ts",
    auth: "Customer",
    safety: "SAFE_READ",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Previews checkout totals before an order is created.",
    usage: "Likely used for pricing, delivery fee, and inventory validation.",
    notes: ["Confirm whether route writes any data before enabling console execution."],
  },
  {
    id: "payments-initialize-post",
    module: "Checkout & Payments",
    title: "Initialize Paystack Payment",
    method: "POST",
    path: "/api/payments/initialize",
    sourceFile: "src/app/api/payments/initialize/route.ts",
    auth: "Order owner or admin",
    safety: "CONTROLLED_ACTION",
    documentationStatus: "VERIFIED",
    description: "Creates a Paystack payment session for an eligible pending Manna order.",
    usage: "Call after checkout order creation. Returns the Paystack authorization URL.",
    requestExample: {
      orderId: "437eb173-324d-4d6a-948b-3b453f7e5cdf",
    },
    responseExample: {
      ok: true,
      payment: {
        orderId: "437eb173-324d-4d6a-948b-3b453f7e5cdf",
        orderNumber: "MAN-20260315-SP1D8C2Z1R",
        amountNgn: 19200,
        reference: "PAY-MAN-20260315-EMDMKQ4CXSFZRA",
        authorizationUrl: "https://checkout.paystack.com/...",
      },
    },
    notes: [
      "orderId must be the database UUID, not orderNumber.",
      "Order must be PENDING_PAYMENT and paymentStatus must be PENDING.",
      "This creates a real Paystack checkout session.",
    ],
  },
  {
    id: "payments-confirm-post",
    module: "Checkout & Payments",
    title: "Confirm Payment Status",
    method: "POST",
    path: "/api/payments/confirm",
    sourceFile: "src/app/api/payments/confirm/route.ts",
    auth: "Order owner or admin",
    safety: "SAFE_READ",
    documentationStatus: "VERIFIED",
    description: "Returns the current order and payment state after Paystack checkout.",
    usage: "Used by frontend after a customer returns from Paystack.",
    requestExample: {
      orderId: "437eb173-324d-4d6a-948b-3b453f7e5cdf",
    },
    notes: [
      "This route reads status only.",
      "Paystack webhook is the trusted source that marks orders PAID.",
    ],
  },

  // =========================================================
  // ORDERS & DOCUMENTS
  // =========================================================
  {
    id: "orders-list-get",
    module: "Orders & Documents",
    title: "List Orders",
    method: "GET",
    path: "/api/orders",
    sourceFile: "src/app/api/orders/route.ts",
    auth: "Authenticated user",
    safety: "SAFE_READ",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Returns orders available to the authenticated user.",
    usage: "Used by customer order history or admin views depending on role.",
    notes: ["Confirm role filtering and pagination."],
  },
  {
    id: "order-detail-get",
    module: "Orders & Documents",
    title: "Get Order Details",
    method: "GET",
    path: "/api/orders/[id]",
    sourceFile: "src/app/api/orders/[id]/route.ts",
    auth: "Order owner or admin",
    safety: "SAFE_READ",
    documentationStatus: "SOURCE_REVIEW_REQUIRED",
    description: "Returns a single order and associated information.",
    usage: "Used by order detail pages.",
    pathParams: [
      {
        name: "id",
        description: "Order UUID.",
        example: "437eb173-324d-4d6a-948b-3b453f7e5cdf",
      },
    ],
    notes: [],
  },
  needsSourceReview({
    id: "order-cancel-post",
    module: "Orders & Documents",
    title: "Cancel Order",
    method: "POST",
    path: "/api/orders/[id]/cancel",
    sourceFile: "src/app/api/orders/[id]/cancel/route.ts",
    auth: "Order owner or admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Order UUID.", example: "uuid" }],
    description: "Cancels an order when its lifecycle state permits it.",
    usage: "Requires source review and explicit approval before console execution.",
  }),
  needsSourceReview({
    id: "order-delivery-resync-post",
    module: "Orders & Documents",
    title: "Resync Delivery Status",
    method: "POST",
    path: "/api/orders/[id]/delivery/resync",
    sourceFile: "src/app/api/orders/[id]/delivery/resync/route.ts",
    auth: "Admin or order owner",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Order UUID.", example: "uuid" }],
    description: "Requests a provider delivery-status resynchronization for an order.",
    usage: "Requires source review before console execution is approved.",
  }),
  needsSourceReview({
    id: "order-invoice-get",
    module: "Orders & Documents",
    title: "Get Invoice Data",
    method: "GET",
    path: "/api/orders/[id]/invoice",
    sourceFile: "src/app/api/orders/[id]/invoice/route.ts",
    auth: "Order owner or admin",
    safety: "SAFE_READ",
    pathParams: [
      {
        name: "id",
        description: "Order UUID.",
        example: "uuid",
      },
    ],
  }),
  {
    id: "order-invoice-pdf-get",
    module: "Orders & Documents",
    title: "Download Invoice PDF",
    method: "GET",
    path: "/api/orders/[id]/invoice.pdf",
    sourceFile: "src/app/api/orders/[id]/invoice.pdf/route.ts",
    auth: "Order owner or admin",
    safety: "SAFE_READ",
    documentationStatus: "VERIFIED",
    description: "Generates and returns a styled invoice PDF for an order.",
    usage: "Open in browser or download from order details.",
    pathParams: [
      {
        name: "id",
        description: "Order UUID.",
        example: "uuid",
      },
    ],
    notes: [
      "Uses PDFKit in Node runtime.",
      "Uses the Manna invoice styling and loaded font/logo assets.",
    ],
  },
  needsSourceReview({
    id: "order-receipt-email-post",
    module: "Orders & Documents",
    title: "Send Receipt Email",
    method: "POST",
    path: "/api/orders/[id]/receipt/email",
    sourceFile: "src/app/api/orders/[id]/receipt/email/route.ts",
    auth: "Order owner or admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Order UUID.", example: "uuid" }],
    description: "Sends an order receipt by email.",
    usage: "Requires source review before console execution is approved.",
  }),
  needsSourceReview({
    id: "order-status-post",
    module: "Orders & Documents",
    title: "Get Order Status",
    method: "POST",
    path: "/api/orders/[id]/status",
    sourceFile: "src/app/api/orders/[id]/status/route.ts",
    auth: "Order owner or admin",
    safety: "SAFE_READ",
    pathParams: [{ name: "id", description: "Order UUID.", example: "uuid" }],
    description: "Returns the current status for an order through a POST handler.",
    usage: "Requires source review before console execution is approved.",
  }),
  needsSourceReview({
    id: "order-tracking-get",
    module: "Orders & Documents",
    title: "Get Delivery Tracking",
    method: "GET",
    path: "/api/orders/[id]/tracking",
    sourceFile: "src/app/api/orders/[id]/tracking/route.ts",
    auth: "Order owner or admin",
    safety: "SAFE_READ",
    pathParams: [
      {
        name: "id",
        description: "Order UUID.",
        example: "uuid",
      },
    ],
  }),

  // =========================================================
  // ADMIN PRODUCTS
  // =========================================================
  needsSourceReview({
    id: "admin-products-list-get",
    module: "Admin Products",
    title: "List Products for Admin",
    method: "GET",
    path: "/api/admin/products",
    sourceFile: "src/app/api/admin/products/route.ts",
    auth: "Admin",
    safety: "SAFE_READ",
  }),
  needsSourceReview({
    id: "admin-products-create-post",
    module: "Admin Products",
    title: "Create Product",
    method: "POST",
    path: "/api/admin/products",
    sourceFile: "src/app/api/admin/products/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
  }),
  needsSourceReview({
    id: "admin-product-get",
    module: "Admin Products",
    title: "Get Admin Product",
    method: "GET",
    path: "/api/admin/products/[id]",
    sourceFile: "src/app/api/admin/products/[id]/route.ts",
    auth: "Admin",
    safety: "SAFE_READ",
    pathParams: [{ name: "id", description: "Product UUID.", example: "uuid" }],
  }),
  needsSourceReview({
    id: "admin-product-action-post",
    module: "Admin Products",
    title: "Update Admin Product",
    method: "POST",
    path: "/api/admin/products/[id]",
    sourceFile: "src/app/api/admin/products/[id]/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Product UUID.", example: "uuid" }],
  }),
  needsSourceReview({
    id: "admin-product-variant-create-post",
    module: "Admin Products",
    title: "Create Product Variant",
    method: "POST",
    path: "/api/admin/products/[id]/variants",
    sourceFile: "src/app/api/admin/products/[id]/variants/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Product UUID.", example: "uuid" }],
  }),
  needsSourceReview({
    id: "admin-product-variant-update-patch",
    module: "Admin Products",
    title: "Update Product Variant",
    method: "PATCH",
    path: "/api/admin/products/[id]/variants/[variantId]",
    sourceFile: "src/app/api/admin/products/[id]/variants/[variantId]/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [
      { name: "id", description: "Product UUID.", example: "uuid" },
      { name: "variantId", description: "Variant UUID.", example: "uuid" },
    ],
    description: "Updates an existing product variant.",
    usage: "Requires source review before console execution is approved.",
  }),
  needsSourceReview({
    id: "admin-product-variant-delete",
    module: "Admin Products",
    title: "Delete Product Variant",
    method: "DELETE",
    path: "/api/admin/products/[id]/variants/[variantId]",
    sourceFile: "src/app/api/admin/products/[id]/variants/[variantId]/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [
      { name: "id", description: "Product UUID.", example: "uuid" },
      { name: "variantId", description: "Variant UUID.", example: "uuid" },
    ],
    description: "Deletes an existing product variant.",
    usage: "Requires source review before console execution is approved.",
  }),

  // =========================================================
  // ADMIN DISCOUNTS
  // =========================================================
  needsSourceReview({
    id: "admin-discounts-list-get",
    module: "Admin Discounts",
    title: "List Discounts",
    method: "GET",
    path: "/api/admin/discounts",
    sourceFile: "src/app/api/admin/discounts/route.ts",
    auth: "Admin",
    safety: "SAFE_READ",
  }),
  needsSourceReview({
    id: "admin-discounts-create-post",
    module: "Admin Discounts",
    title: "Create Discount",
    method: "POST",
    path: "/api/admin/discounts",
    sourceFile: "src/app/api/admin/discounts/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
  }),
  needsSourceReview({
    id: "admin-discount-update-patch",
    module: "Admin Discounts",
    title: "Update Discount",
    method: "PATCH",
    path: "/api/admin/discounts/[id]",
    sourceFile: "src/app/api/admin/discounts/[id]/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Discount UUID.", example: "uuid" }],
    description: "Updates a discount configuration.",
    usage: "Requires source review before console execution is approved.",
  }),
  needsSourceReview({
    id: "admin-discount-toggle-post",
    module: "Admin Discounts",
    title: "Toggle Discount",
    method: "POST",
    path: "/api/admin/discounts/[id]/toggle",
    sourceFile: "src/app/api/admin/discounts/[id]/toggle/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
    pathParams: [{ name: "id", description: "Discount UUID.", example: "uuid" }],
  }),

  // =========================================================
  // ADMIN OPERATIONS
  // =========================================================
  needsSourceReview({
    id: "admin-orders-get",
    module: "Admin Operations",
    title: "List Orders for Admin",
    method: "GET",
    path: "/api/admin/orders",
    sourceFile: "src/app/api/admin/orders/route.ts",
    auth: "Admin",
    safety: "SAFE_READ",
  }),
  needsSourceReview({
    id: "admin-delivery-dispatch-post",
    module: "Admin Operations",
    title: "Dispatch Queued Delivery",
    method: "POST",
    path: "/api/admin/deliveries/[deliveryId]/dispatch",
    sourceFile: "src/app/api/admin/deliveries/[deliveryId]/dispatch/route.ts",
    auth: "Admin",
    safety: "CONTROLLED_ACTION",
    description: "Dispatches a queued delivery through the central, vehicle-aware KWIK delivery service.",
    usage: "Keep disabled in generic Backend Console execution until staging proves a real queued delivery can create one KWIK task and persist its tracking details.",
    pathParams: [
      {
        name: "deliveryId",
        description: "Queued Delivery UUID.",
        example: "uuid",
      },
    ],
    notes: [
      "The delivery service atomically claims a READY_FOR_DISPATCH placeholder before calling KWIK.",
      "A failed KWIK attempt is returned to the manual queue for deliberate operator retry.",
      "Do not enable generic-console execution until this target route passes a real staging dispatch test.",
    ],
  }),
  needsSourceReview({
    id: "admin-test-delivery-post",
    module: "Admin Operations",
    title: "Test Delivery from Order",
    method: "POST",
    path: "/api/admin/test/delivery/from-order",
    sourceFile: "src/app/api/admin/test/delivery/from-order/route.ts",
    auth: "Admin",
    safety: "RESTRICTED_SYSTEM",
    description: "Local-only delivery test route that can create a real KWIK task.",
    usage: "Disabled unless MANNA_TEST_ROUTES_ENABLED=true in local development; never enable generic-console execution.",
    notes: ["Returns 404 outside explicitly enabled local development."],
  }),

  // =========================================================
  // WEBHOOKS, CRON & INTERNAL SYSTEM ROUTES
  // =========================================================
  needsSourceReview({
    id: "paystack-webhook-post",
    module: "System Routes",
    title: "Paystack Payment Webhook",
    method: "POST",
    path: "/api/webhooks/paystack",
    sourceFile: "src/app/api/webhooks/paystack/route.ts",
    auth: "Paystack signature",
    safety: "RESTRICTED_SYSTEM",
    description: "Receives Paystack charge.success events, verifies the raw-body signature, and advances order fulfilment.",
    usage: "Provider-only route. Signature generation is tested in the console utility layer, but console replay remains disabled.",
    requestExample: {
      event: "charge.success",
      data: {
        reference: "PAY-MAN-...",
      },
    },
    notes: [
      "Requires x-paystack-signature generated using the active Paystack secret key.",
      "The handler currently checks PAID status before, rather than atomically with, stock/order updates; concurrent replay hardening remains required.",
      "Never enable manual production replay before exactly-once payment handling and delivery dispatch are verified.",
    ],
  }),
  needsSourceReview({
    id: "payment-webhook-post",
    module: "System Routes",
    title: "Payment Webhook",
    method: "POST",
    path: "/api/webhooks/payment",
    sourceFile: "src/app/api/webhooks/payment/route.ts",
    auth: "Payment provider/system",
    safety: "RESTRICTED_SYSTEM",
    description: "Additional payment webhook route discovered in the codebase.",
    usage: "Review whether this is legacy, test-only, or active before production.",
    notes: ["Potential duplicate payment webhook path; source review is important."],
  }),
  {
    id: "kwik-webhook-post",
    module: "System Routes",
    title: "KWIK Delivery Webhook",
    method: "POST",
    path: "/api/webhooks/kwik",
    sourceFile: "src/app/api/webhooks/kwik/route.ts",
    auth: "KWIK webhook secret",
    safety: "RESTRICTED_SYSTEM",
    documentationStatus: "VERIFIED",
    description: "Receives KWIK delivery events, deduplicates them, updates delivery status, and synchronizes the related order status.",
    usage: "Called by KWIK only. Never manually execute from the console.",
    notes: [
      "Uses x-kwik-secret or secret query parameter.",
      "Stores webhook events for deduplication and audit.",
      "Uses forward-only delivery status transitions.",
    ],
  },
  needsSourceReview({
    id: "kwik-sync-cron-get",
    module: "System Routes",
    title: "KWIK Status Sync Cron",
    method: "GET",
    path: "/api/cron/kwik-sync",
    sourceFile: "src/app/api/cron/kwik-sync/route.ts",
    auth: "Cron secret or internal scheduler",
    safety: "RESTRICTED_SYSTEM",
    description: "Synchronizes eligible in-progress KWIK deliveries with the provider status API.",
    usage: "Scheduler-only route. The console can construct its server-side secret, but execution stays disabled until isolated integration verification.",
    notes: [
      "Requires the CRON_SECRET query parameter; the console injects it server-side.",
      "May call KWIK and update delivery/order states.",
      "Processes at most 25 due deliveries per invocation.",
    ],
  }),
  needsSourceReview({
    id: "debug-env-get",
    module: "System Routes",
    title: "Environment Debug",
    method: "GET",
    path: "/api/debug/env",
    sourceFile: "src/app/api/debug/env/route.ts",
    auth: "Internal only",
    safety: "RESTRICTED_SYSTEM",
    description: "Local diagnostic route, disabled unless MANNA_DEBUG_ROUTES_ENABLED=true in development.",
    usage: "Never enable this route in staging or production.",
    notes: ["Returns 404 unless it is explicitly enabled in local development."],
  }),
  needsSourceReview({
    id: "internal-create-delivery-post",
    module: "System Routes",
    title: "Internal Create Delivery",
    method: "POST",
    path: "/api/internal/order/[orderid]/create-delivery",
    sourceFile: "src/app/api/internal/order/[orderid]/create-delivery/route.ts",
    auth: "Internal service",
    safety: "RESTRICTED_SYSTEM",
    pathParams: [
      {
        name: "orderid",
        description: "Order UUID.",
        example: "uuid",
      },
    ],
    description: "Internal route that creates delivery from an order.",
    usage: "Do not expose to normal console users. It may trigger a real KWIK delivery.",
    notes: ["Action route is POST and may create a real KWIK delivery."],
  }),
];

function routeKey(method: ApiMethod, path: string) {
  return `${method} ${path}`;
}

function createRouteId(method: string, path: string) {
  return `${method.toLowerCase()}-${path
    .replace(/^\/api\//, "")
    .replace(/\//g, "-")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase()}`;
}

const documentedRouteByKey = new Map(
  documentedMannaApiRoutes.map((route) => [
    routeKey(route.method, route.path),
    route,
  ])
);

export const mannaApiRoutes: ApiRouteDefinition[] = generatedApiRoutes.map(
  (generatedRoute) => {
    const existing = documentedRouteByKey.get(
      routeKey(generatedRoute.method, generatedRoute.path)
    );

    if (existing) {
      return {
        ...existing,
        sourceFile: generatedRoute.sourceFile,
      };
    }

    return {
      id: createRouteId(generatedRoute.method, generatedRoute.path),
      module: "New / Unclassified",
      title: `${generatedRoute.method} ${generatedRoute.path}`,
      method: generatedRoute.method,
      path: generatedRoute.path,
      sourceFile: generatedRoute.sourceFile,
      auth: "Needs security review",
      safety: "RESTRICTED_SYSTEM",
      documentationStatus: "SOURCE_REVIEW_REQUIRED",
      description:
        "This endpoint was discovered automatically from the Manna backend. Its purpose, permissions, request body, response structure, and risks have not yet been documented.",
      usage:
        "Review the route handler, add documentation to the route registry, then explicitly approve or restrict console execution.",
      notes: [
        "Automatically discovered from a route.ts file.",
        "Execution remains disabled until source review is complete.",
        "Document changes whenever this handler is updated.",
      ],
    };
  }
);