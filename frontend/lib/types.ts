export type Role = 'SUPERADMIN' | 'ADMIN' | 'CUSTOMER' | 'CLIENT';

export interface User {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
}

export interface AdminManagedUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  createdAt: string;
}

export interface Ingredient {
  id: string;
  name: string;
  ingredientCode?: string;
  unit: 'g' | 'ml' | 'pcs';
  currentStock: number;
  reorderLevel?: number;
  costTrackingMethod: string;
}

export interface StockLotAllocation {
  lotCode: string;
  qty: number;
  unitCost?: number | null;
}

export interface IngredientTransaction {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit?: 'g' | 'ml' | 'pcs' | null;
  type: 'IN' | 'OUT';
  qty: number;
  inputUnit?: 'g' | 'kg' | 'ml' | 'l' | 'pcs' | null;
  unitCost?: number | null;
  note?: string | null;
  lotCode?: string | null;
  remainingQty?: number | null;
  allocations?: StockLotAllocation[];
  createdAt: string;
  createdBy?: string | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  currentStock: number;
  isActive: boolean;
  images?: string[];
}

export interface ProductCategory {
  id: string;
  name: string;
  sku: string;
  legacySkus?: string[];
}

export interface ProductLotAllocation {
  lotCode: string;
  qty: number;
  unitCost?: number | null;
  subtotalCost?: number | null;
  producedAt?: string | null;
  reference?: string | null;
}

export interface ProductLot {
  id: string;
  productId: string;
  lotCode: string;
  bakeRecordId?: string | null;
  recipeVersion?: number | null;
  producedQty: number;
  remainingQty: number;
  unitCost?: number | null;
  totalCost?: number | null;
  producedAt: string;
  note?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RecipeItem {
  ingredientId: string;
  ingredientName?: string;
  unit?: string | null;
  qtyPerBatch: number;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  version?: number;
  yieldQty: number;
  items: RecipeItem[];
}

export interface BakeAppliedItem {
  ingredientId: string;
  ingredientName?: string;
  unit?: string;
  qtyPerBatch: number;
}

export interface BakeDeduction {
  ingredientId: string;
  ingredientName?: string;
  unit?: string;
  qty: number;
  cost?: number;
  lotAllocations?: StockLotAllocation[];
}

export interface BakeRecord {
  id: string;
  recipeId: string;
  productId: string;
  recipeVersion?: number;
  customOverride?: boolean;
  appliedItems?: BakeAppliedItem[];
  factor: number;
  producedQty: number;
  totalIngredientCost?: number;
  producedUnitCost?: number;
  deductions?: BakeDeduction[];
  createdAt: string;
}

export type OrderStatus = 'NEW' | 'CONFIRMED' | 'PAID' | 'CANCELLED' | 'COMPLETED';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Order {
  id: string;
  userId: string | null;
  status: OrderStatus;
  items: OrderItem[];
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryAddress?: string | null;
  note?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  stockDeducted: boolean;
  cancelReason?: string | null;
  holdExpiresAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface OrderStatusTimelineEntry {
  status: OrderStatus;
  changedAt: string;
  actorEmail?: string | null;
  cancelReason?: string | null;
}

export interface DashboardData {
  totalOrders: number;
  revenue: number;
  estimatedCost: number;
  estimatedProfit: number;
  lowStockIngredients: number;
  bakesLast7Days: number;
  bakesLast30Days: number;
  statusBreakdown: { status: string; count: number }[];
  revenueLast7Days: { day: string; revenue: number }[];
}

export type AuditModule = 'PRODUCT' | 'INGREDIENT' | 'CATEGORY' | 'RECIPE' | 'PRODUCTION' | 'ORDER' | 'USER';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'STOCK_ADJUST' | 'PRODUCE' | 'IMPORT';

export interface AuditLogListItem {
  id: string;
  title: string;
  module: AuditModule | string;
  action: AuditAction | string;
  entityId?: string;
  actorEmail?: string;
  createdAt: string;
}

export interface AuditLogDetail {
  id: string;
  title: string;
  module: AuditModule | string;
  action: AuditAction | string;
  entityId?: string;
  actorId?: string;
  actorEmail?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export type DatabaseFilterOperator =
  | 'EQ'
  | 'NE'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'IN'
  | 'EXISTS';

export interface DatabaseFilterCondition {
  field: string;
  operator: DatabaseFilterOperator;
  value: string;
}

export interface DatabaseCollection {
  name: string;
  count: number;
}

export interface DatabaseCollectionFields {
  collection: string;
  fields: string[];
}

export interface DatabaseQueryRow {
  id: string;
  document: Record<string, unknown>;
}

export interface DatabaseQueryResponse {
  collection: string;
  total: number;
  page: number;
  pageSize: number;
  rows: DatabaseQueryRow[];
}

export interface DatabaseUnlockResponse {
  accessToken: string;
  expiresAt: string;
  backupFileName: string;
  backupFilePath: string;
}

export interface DatabaseBackupResponse {
  fileName: string;
  filePath: string;
  trigger: 'AUTO' | 'MANUAL' | string;
  createdAt: string;
}

export interface DatabaseBackupFileSummary {
  fileName: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
}

export interface DatabaseBackupCollectionSummary {
  name: string;
  count: number;
}

export interface DatabaseBackupDetail {
  fileName: string;
  filePath: string;
  createdAt: string;
  trigger: string;
  actorEmail: string;
  database: string;
  totalDocuments: number;
  collections: DatabaseBackupCollectionSummary[];
}

export interface DatabaseRestoreBackupResponse {
  restoredFromFile: string;
  restoredAt: string;
  collectionsRestored: number;
  documentsRestored: number;
  preRestoreBackupFile: string;
}

export interface DatabaseDependencyReference {
  collection: string;
  documentId: string;
  documentTitle: string;
  fieldPath: string;
  valuePreview: string;
}

export interface DatabaseDependencyCheckResponse {
  targetCollection: string;
  targetDocumentId: string;
  targetDocumentTitle: string;
  dependencyCount: number;
  dependencies: DatabaseDependencyReference[];
}

export type DatabaseDependencyResolveAction = 'REMOVE' | 'REPLACE';

export interface DatabaseDependencyResolveOperation {
  collection: string;
  documentId: string;
  fieldPath: string;
  action: DatabaseDependencyResolveAction;
  replacementCollection?: string;
  replacementDocumentId?: string;
  replacementValue?: string;
}

export interface DatabaseDependencyResolveResponse {
  targetCollection: string;
  targetDocumentId: string;
  totalOperations: number;
  appliedOperations: number;
}

export type DatabaseWipeScope = 'COLLECTION' | 'DATABASE';

export interface DatabaseWipeResponse {
  scope: DatabaseWipeScope;
  collection?: string | null;
  deletedDocuments: number;
  backupFile: string;
}
