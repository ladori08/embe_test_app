export type Role = 'ADMIN' | 'CLIENT';

export interface User {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
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

export interface RecipeItem {
  ingredientId: string;
  ingredientName?: string;
  qtyPerBatch: number;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  yieldQty: number;
  items: RecipeItem[];
}

export interface BakeRecord {
  id: string;
  recipeId: string;
  productId: string;
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
