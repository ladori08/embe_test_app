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
  unit: 'g' | 'ml' | 'pcs';
  currentStock: number;
  reorderLevel?: number;
  costTrackingMethod: string;
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

export interface BakeRecord {
  id: string;
  recipeId: string;
  productId: string;
  recipeVersion?: number;
  customOverride?: boolean;
  appliedItems?: BakeAppliedItem[];
  factor: number;
  producedQty: number;
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
  userId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  stockDeducted: boolean;
  createdAt: string;
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
