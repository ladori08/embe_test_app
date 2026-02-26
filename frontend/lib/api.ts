import { DashboardData, Ingredient, Order, Product, Recipe, User } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // keep default
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<User>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  logout: () =>
    request<void>('/api/auth/logout', {
      method: 'POST'
    }),
  me: () => request<User>('/api/auth/me'),

  listPublicProducts: () => request<Product[]>('/api/products/public'),
  getPublicProduct: (id: string) => request<Product>(`/api/products/public/${id}`),

  listIngredients: () => request<Ingredient[]>('/api/admin/ingredients'),
  createIngredient: (payload: Partial<Ingredient>) => request<Ingredient>('/api/admin/ingredients', { method: 'POST', body: JSON.stringify(payload) }),
  updateIngredient: (id: string, payload: Partial<Ingredient>) => request<Ingredient>(`/api/admin/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteIngredient: (id: string) => request<void>(`/api/admin/ingredients/${id}`, { method: 'DELETE' }),

  listProductsAdmin: () => request<Product[]>('/api/admin/products'),
  createProduct: (payload: Partial<Product>) => request<Product>('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id: string, payload: Partial<Product>) => request<Product>(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id: string) => request<void>(`/api/admin/products/${id}`, { method: 'DELETE' }),

  listRecipes: () => request<Recipe[]>('/api/admin/recipes'),
  createRecipe: (payload: unknown) => request<Recipe>('/api/admin/recipes', { method: 'POST', body: JSON.stringify(payload) }),
  updateRecipe: (id: string, payload: unknown) => request<Recipe>(`/api/admin/recipes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRecipe: (id: string) => request<void>(`/api/admin/recipes/${id}`, { method: 'DELETE' }),

  produceBake: (payload: unknown) => request('/api/admin/bakes', { method: 'POST', body: JSON.stringify(payload) }),
  listBakes: () => request('/api/admin/bakes'),

  createOrder: (payload: unknown) => request<Order>('/api/orders', { method: 'POST', body: JSON.stringify(payload) }),
  listMyOrders: () => request<Order[]>('/api/orders'),

  listOrdersAdmin: () => request<Order[]>('/api/admin/orders'),
  updateOrderStatus: (id: string, status: string) => request<Order>(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getDashboard: () => request<DashboardData>('/api/dashboard')
};

export { ApiError };
