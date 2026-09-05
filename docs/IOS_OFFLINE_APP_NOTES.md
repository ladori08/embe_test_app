# Embe App Notes for Offline iOS Rewrite

This document captures the current product logic, data model, and baseline requirements as of the mobile/LAN responsive work. It is intended as a handoff/spec note for rewriting Embe as an offline-first standalone iOS app.

## Current App Purpose

Embe is a bakery/cafe management and storefront app.

It currently has two main surfaces:

- Storefront for browsing products, adding to cart, and placing pickup/delivery orders.
- Admin panel for inventory, products, media, users, recipes, production/bake workflow, orders, dashboard, history, and superadmin database tools.

Current technical stack:

- Frontend: Next.js App Router, TypeScript, Tailwind.
- Backend: Java 21, Spring Boot 3.
- Database: MongoDB replica set.
- Runtime: Docker Compose for local/dev.
- Auth: JWT stored in an httpOnly cookie.
- Product images: uploaded to backend filesystem and referenced by product records.
- Backup/admin database console: backend-managed backup/restore/export features.

## Current Operating Principles

### Roles and Access

- Roles: `SUPERADMIN`, `ADMIN`, `CUSTOMER`, `CLIENT`.
- `SUPERADMIN` effectively includes admin/customer access.
- `CLIENT` effectively includes customer access.
- Admin pages require admin-level auth.
- Database console requires `SUPERADMIN` and an additional password unlock.
- Storefront browsing is public.
- Order creation is public in backend rules, while cart/checkout UI works with user/session context.

### Storefront

- Public users can view active products.
- Product cards show name, category, price, stock, and images if available.
- Product detail shows product information and allows quantity selection.
- Cart is stored client-side in local storage.
- Cart stock is kept in sync by:
  - initial product stock snapshot,
  - periodic polling,
  - product stock server-sent events in the current web app.
- Cart prevents adding more than available stock.
- Checkout collects:
  - recipient name,
  - phone,
  - delivery address,
  - pickup date,
  - pickup time,
  - payment method,
  - optional note.
- Checkout validates required recipient/delivery fields and phone format.
- Payment methods:
  - `COD_DEPOSIT`,
  - `BANK_TRANSFER`.
- COD deposit displays a required deposit equal to 50% of subtotal.
- Storefront warns that orders should be placed at least one day ahead, and same-day pickup should be confirmed by message.

### Orders

- Order statuses:
  - `NEW`,
  - `CONFIRMED`,
  - `PAID`,
  - `CANCELLED`,
  - `COMPLETED`.
- Orders include item snapshots with product id, name, price, and quantity.
- Orders store subtotal, tax, total, stock-deducted state, hold expiry, cancel reason, and timestamps.
- Checkout uses an idempotency key to avoid duplicate order creation on retry.
- Newly placed orders have a hold window. The current UI communicates a 30-minute hold.
- Admin can transition order statuses using allowed actions.
- Order history/timeline records status changes, actor, timestamp, and cancel reason when relevant.
- Stock may be deducted/restored depending on order status transitions.
- Cancelled orders can restore stock if stock had already been deducted.

### Ingredients and Inventory

- Ingredients represent base inventory.
- Ingredient fields include name, code, unit, current stock, reorder level, cost tracking method, and timestamps.
- Supported ingredient units are currently `g`, `ml`, and `pcs`.
- Admin can create, edit, delete, restock, and import ingredients.
- Restock creates an `IN` stock transaction.
- Ingredient consumption creates an `OUT` stock transaction.
- Stock transactions capture:
  - ingredient id/name/unit,
  - transaction type,
  - quantity,
  - input unit,
  - unit cost,
  - lot code,
  - remaining lot quantity,
  - FIFO allocation details,
  - note,
  - created time/by.
- Bulk import supports Excel `.xlsx` and recognizes required/optional columns for ingredient setup.

### Products and Product Lots

- Products represent sellable baked goods.
- Products include name, SKU, category, price, cost, current stock, active/hidden state, image list, and timestamps.
- Public storefront only lists active products.
- Product categories generate/hold SKU prefixes and legacy SKU aliases.
- Product lots track produced inventory batches.
- Product lot fields include product id, lot code, bake record id, recipe version, produced quantity, remaining quantity, unit cost, total cost, produced time, note, and timestamps.
- Product stock logs track product stock movements:
  - product id,
  - movement type,
  - quantity,
  - note,
  - related order id,
  - created time/by.

### Media

- Product images are uploaded through admin product/media flows.
- Uploaded files are stored in a product-image storage directory.
- Products store image path strings.
- Storefront/admin resolve image URLs for display.
- Media admin lists uploaded images and allows selecting/deleting media.

### Recipes

- Each recipe is tied to one product.
- Recipe fields include product id, version, yield quantity, ingredient lines, and timestamps.
- Ingredient lines include ingredient id, ingredient display name/unit, and quantity per batch.
- Recipe updates increment or record versions.
- Recipe revisions preserve old recipe states with:
  - recipe id,
  - product id,
  - version,
  - yield quantity,
  - items,
  - changed time/by,
  - change type.

### Production / Bake Workflow

- A bake produces product stock from a recipe.
- Admin selects a recipe and production factor or produced quantity.
- The system calculates required ingredient deductions based on recipe items and factor.
- The bake workflow is transactional in the current backend.
- Bake records are idempotent through an idempotency key.
- A bake can use recipe overrides/customized ingredient lines.
- Bake creates:
  - ingredient deductions,
  - product stock increment,
  - product lot,
  - product stock logs,
  - bake history.
- FIFO lot allocation is used to calculate ingredient cost and consume ingredient stock.
- Bake records store:
  - recipe id,
  - product id,
  - recipe version,
  - whether custom override was used,
  - applied items,
  - factor,
  - produced quantity,
  - total ingredient cost,
  - produced unit cost,
  - deductions with lot allocations,
  - created time/by.

### Dashboard

- Admin dashboard shows:
  - total orders,
  - revenue,
  - estimated cost,
  - estimated profit,
  - low-stock ingredient count,
  - bake counts for recent windows,
  - order status breakdown,
  - revenue for the last 7 days.

### Audit History

- Audit logs record business changes.
- Modules:
  - `PRODUCT`,
  - `INGREDIENT`,
  - `CATEGORY`,
  - `RECIPE`,
  - `PRODUCTION`,
  - `ORDER`,
  - `USER`.
- Actions:
  - `CREATE`,
  - `UPDATE`,
  - `DELETE`,
  - `STATUS_CHANGE`,
  - `STOCK_ADJUST`,
  - `PRODUCE`,
  - `IMPORT`.
- Audit entries include title, module, action, entity id, actor id/email, before data, after data, metadata, and created time.
- Superadmin can see user-module audit details.

### Database Console and Backup

- Superadmin database console can be unlocked with the current user's password.
- Unlocking starts a short-lived database console session.
- Opening/unlocking creates an automatic backup.
- Console supports:
  - listing collections,
  - field discovery,
  - querying rows,
  - filters,
  - sorting,
  - pagination,
  - friendly/raw views,
  - editing documents,
  - dependency checks before delete,
  - dependency resolve actions,
  - delete/wipe with confirmation,
  - backup list/detail,
  - restore,
  - export CSV/XLSX,
  - local folder path display/open.
- Google Drive backup support exists through rclone in the current server-based app.

### Mobile/LAN Behavior Added Recently

- Store/Admin layouts are responsive for phone browsers.
- Admin sidebar becomes a horizontal sticky tab strip on mobile.
- Tables keep readable column widths and scroll horizontally on mobile.
- Top navigation wraps better and shows a Login link when signed out.
- Frontend API calls can use same-origin `/api/...` rewrites so phone browsers do not need to call backend port `8080` directly.
- Next rewrites proxy `/api/:path*` to the backend service.
- Local Docker CORS allowlist includes localhost, `192.168.1.4`, `macbook-pro-2.localhost`, and `MacBook-Pro-2.local`.
- Dashboard security matcher includes both `/api/dashboard` and `/api/dashboard/**`.

## Current Data Model

### User

- `id: string`
- `email: string`, unique
- `fullName: string`
- `passwordHash: string`
- `roles: Role[]`
- `createdAt: datetime`

Role enum:

- `SUPERADMIN`
- `ADMIN`
- `CUSTOMER`
- `CLIENT`

### ProductCategory

- `id: string`
- `name: string`
- `nameKey: string`, unique
- `sku: string`, unique
- `legacySkus: string[]`
- `createdAt: datetime`
- `updatedAt: datetime`

### Ingredient

- `id: string`
- `name: string`, unique
- `ingredientCode: string`, unique sparse/optional
- `unit: "g" | "ml" | "pcs"`
- `currentStock: decimal`
- `reorderLevel: decimal`
- `costTrackingMethod: string`
- `createdAt: datetime`
- `updatedAt: datetime`

### IngredientStockTransaction

- `id: string`
- `ingredientId: string`
- `ingredientName: string`
- `type: "IN" | "OUT"`
- `qty: decimal`
- `inputUnit: string | null`
- `unitCost: decimal | null`
- `lotCode: string | null`
- `remainingQty: decimal | null`
- `allocations: StockLotAllocation[]`
- `note: string | null`
- `createdAt: datetime`
- `createdBy: string | null`

`StockLotAllocation`:

- `lotCode: string`
- `qty: decimal`
- `unitCost: decimal | null`

### Product

- `id: string`
- `name: string`
- `sku: string`, unique
- `category: string`
- `price: decimal`
- `cost: decimal`
- `currentStock: decimal`
- `active: boolean`
- `images: string[]`
- `createdAt: datetime`
- `updatedAt: datetime`

### ProductLot

- `id: string`
- `productId: string`
- `lotCode: string`
- `bakeRecordId: string | null`
- `recipeVersion: number | null`
- `producedQty: decimal`
- `remainingQty: decimal`
- `unitCost: decimal | null`
- `totalCost: decimal | null`
- `producedAt: datetime`
- `note: string | null`
- `createdAt: datetime`
- `updatedAt: datetime`

### ProductStockLog

- `id: string`
- `productId: string`
- `type: ProductStockLogType`
- `qty: decimal`
- `note: string | null`
- `relatedOrderId: string | null`
- `createdAt: datetime`
- `createdBy: string | null`

### ProductMediaImage

This is filesystem-backed in the current app rather than a first-class Mongo entity.

- `fileName: string`
- `path: string`
- `url: string`
- `sizeBytes: number`
- `lastModified: datetime`

### Recipe

- `id: string`
- `productId: string`, unique
- `version: number`
- `yieldQty: decimal`
- `items: RecipeItem[]`
- `createdAt: datetime`
- `updatedAt: datetime`

`RecipeItem`:

- `ingredientId: string`
- `ingredientName: string | null`
- `unit: string | null`
- `qtyPerBatch: decimal`

### RecipeRevision

- `id: string`
- `recipeId: string`
- `productId: string`
- `version: number`
- `yieldQty: decimal`
- `items: RecipeItem[]`
- `changedAt: datetime`
- `changedBy: string | null`
- `changeType: string`

### BakeRecord

- `id: string`
- `idempotencyKey: string`, unique
- `recipeId: string`
- `productId: string`
- `recipeVersion: number`
- `customOverride: boolean`
- `appliedItems: BakeAppliedItem[]`
- `factor: decimal`
- `producedQty: decimal`
- `totalIngredientCost: decimal | null`
- `producedUnitCost: decimal | null`
- `deductions: BakeDeduction[]`
- `createdAt: datetime`
- `createdBy: string | null`

`BakeAppliedItem`:

- `ingredientId: string`
- `ingredientName: string | null`
- `unit: string | null`
- `qtyPerBatch: decimal`

`BakeDeduction`:

- `ingredientId: string`
- `ingredientName: string | null`
- `unit: string | null`
- `qty: decimal`
- `cost: decimal | null`
- `lotAllocations: StockLotAllocation[]`

### Order

- `id: string`
- `userId: string | null`
- `items: OrderItem[]`
- `status: OrderStatus`
- `recipientName: string | null`
- `recipientPhone: string | null`
- `deliveryAddress: string | null`
- `deliveryDate: string | null`
- `deliveryTime: string | null`
- `paymentMethod: PaymentMethod | null`
- `note: string | null`
- `idempotencyKey: string | null`, unique sparse
- `holdExpiresAt: datetime | null`
- `cancelReason: string | null`
- `subtotal: decimal`
- `tax: decimal`
- `total: decimal`
- `stockDeducted: boolean`
- `createdAt: datetime`
- `updatedAt: datetime`

`OrderItem`:

- `productId: string`
- `name: string`
- `price: decimal`
- `qty: decimal`

`OrderStatus`:

- `NEW`
- `CONFIRMED`
- `PAID`
- `CANCELLED`
- `COMPLETED`

`PaymentMethod`:

- `COD_DEPOSIT`
- `BANK_TRANSFER`

### OrderStatusTimelineEntry

Current response model:

- `status: OrderStatus`
- `changedAt: datetime`
- `actorEmail: string | null`
- `cancelReason: string | null`

Timeline data is derived from order/audit/status-change records.

### AuditLog

- `id: string`
- `title: string`
- `module: AuditModule`
- `action: AuditAction`
- `entityId: string | null`
- `actorId: string | null`
- `actorEmail: string | null`
- `beforeData: object | null`
- `afterData: object | null`
- `metadata: object | null`
- `createdAt: datetime`

### DashboardData

Dashboard is derived/read-model data:

- `totalOrders: number`
- `revenue: decimal`
- `estimatedCost: decimal`
- `estimatedProfit: decimal`
- `lowStockIngredients: number`
- `bakesLast7Days: number`
- `bakesLast30Days: number`
- `statusBreakdown: { status, count }[]`
- `revenueLast7Days: { day, revenue }[]`

### Database Console Models

These are mostly admin tool request/response models:

- backup file summaries,
- backup details,
- backup source `LOCAL | DRIVE`,
- collection list/counts,
- collection fields,
- query filters/operators,
- query rows,
- dependency checks/references,
- dependency resolve operations,
- wipe requests/responses,
- restore requests/responses,
- unlock/session token responses.

For an offline iOS rewrite, this should be redesigned as local backup/export/import rather than a raw Mongo console.

## Offline iOS Rewrite Requirements

### Recommended Architecture

- Native iOS app in SwiftUI.
- Local persistence using SQLite through SwiftData/Core Data or a typed SQLite layer.
- Local image storage in the app sandbox.
- Local backup/restore/export through Files app, Share Sheet, or iCloud Drive document picker.
- No required server, no Docker, no Java backend, no MongoDB.

### Offline-First Requirements

- App must fully work with airplane mode enabled.
- All business data must be stored locally on the device.
- App startup must load from local database.
- Writes must be atomic for workflows that update multiple tables, especially bake production and order status transitions.
- Provide manual backup/export and restore/import.
- Clearly communicate that data lives on this device unless a future sync feature is added.

### Core Feature Requirements

- Storefront:
  - browse active products,
  - view product details,
  - add/remove/update cart items,
  - validate available stock,
  - create local orders,
  - show checkout notes and deposit amount.

- Admin:
  - dashboard,
  - ingredients CRUD,
  - ingredient restock and stock history,
  - product categories,
  - products CRUD,
  - product image attach/manage,
  - recipes CRUD and revision history,
  - production/bake workflow,
  - product lots and FIFO cost tracking,
  - orders management/status transitions,
  - users/roles for local access,
  - audit history.

- Superadmin:
  - unlock sensitive maintenance tools with password,
  - backup/export/restore local data,
  - inspect local records in a friendly format,
  - guarded destructive actions with confirmation.

### iOS-Specific UX Requirements

- Use bottom tabs or a compact sidebar replacement for primary sections.
- Storefront should feel simple and customer-friendly.
- Admin should prioritize dense but readable operational screens.
- Tables from the web app should become mobile-native lists with detail screens, filters, and sort controls.
- Long forms should be split into clear sections.
- Numeric quantity inputs should use stepper controls where appropriate.
- Product/media images should use iOS photo picker or Files import.
- All text and actions must be reachable with one-handed phone use.
- Support iPhone portrait first; iPad can use split views later.

### Suggested Local Database Tables

- `users`
- `product_categories`
- `ingredients`
- `ingredient_stock_transactions`
- `products`
- `product_images`
- `recipes`
- `recipe_items`
- `recipe_revisions`
- `recipe_revision_items`
- `bake_records`
- `bake_applied_items`
- `bake_deductions`
- `stock_lot_allocations`
- `product_lots`
- `product_stock_logs`
- `orders`
- `order_items`
- `order_status_events`
- `audit_logs`
- `app_settings`
- `backup_history`

### Critical Business Rules to Preserve

- Do not allow negative product or ingredient stock.
- Do not allow duplicate SKUs.
- Do not allow duplicate ingredient names/codes.
- Product category changes must preserve old/legacy SKU references where needed.
- Recipe must reference valid products and ingredients.
- Recipe update must preserve revision history.
- Bake production must:
  - validate enough ingredient stock,
  - deduct ingredients using FIFO lot allocation,
  - calculate ingredient cost,
  - calculate produced unit cost,
  - increment product stock,
  - create a product lot,
  - create stock logs and audit logs,
  - be atomic.
- Order creation must:
  - snapshot product name/price,
  - validate stock,
  - create idempotently if retry protection is kept,
  - set hold expiry when relevant.
- Order transitions must:
  - follow allowed status rules,
  - deduct/restore product stock exactly once,
  - preserve status timeline,
  - write audit history.
- Destructive actions must be guarded by confirmations and dependency checks.

### What Changes in a Standalone Offline iOS App

- Authentication becomes local app authentication, not JWT/cookies.
- API endpoints disappear; services become local Swift services.
- Mongo documents become typed local records.
- Server-sent stock events disappear; stock state updates instantly through local transactions.
- Docker launcher is no longer needed.
- Multi-device shared state is not available unless a sync layer is added later.
- Google Drive backup through rclone should become an iOS-native export/import or iCloud Drive integration.

### Future Sync Considerations

If multiple phones/iPads need shared data later:

- Add cloud sync with conflict resolution.
- Prefer designing IDs/timestamps now so future sync is possible.
- Every mutation should have stable IDs, created/updated timestamps, and actor info.
- Audit logs should remain append-only.
- Stock mutations should be event-like and replayable where possible.

## Current Local Access Notes

Current local web app can be started with:

- `start-embe.command`, or
- `docker compose up -d --build`

Local URLs:

- Mac: `http://localhost:3000/shop`
- Phone on same Wi-Fi: `http://192.168.1.4:3000/shop`
- Login: `/login`
- Backend direct port: `8080`

The recent mobile fix prefers frontend same-origin API proxy:

- Browser calls `/api/...` on port `3000`.
- Next rewrites proxy requests to backend service.

This proxy detail should not exist in the offline iOS rewrite.
