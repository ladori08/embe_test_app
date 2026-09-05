import {
  AdminManagedUser,
  AuditLogDetail,
  AuditLogListItem,
  BakeRecord,
  DatabaseBackupDetail,
  DatabaseBackupDirectory,
  DatabaseBackupFileSummary,
  DatabaseBackupSource,
  DatabaseBackupResponse,
  DatabaseCollection,
  DatabaseCollectionFields,
  DatabaseDeleteBackupResponse,
  DatabaseDependencyCheckResponse,
  DatabaseDependencyResolveOperation,
  DatabaseDependencyResolveResponse,
  DatabaseFilterCondition,
  DatabaseOpenDirectoryResponse,
  DatabaseQueryResponse,
  DatabaseQueryRow,
  DatabaseRestoreBackupResponse,
  DatabaseUnlockResponse,
  DatabaseWipeResponse,
  DashboardData,
  Ingredient,
  MediaImage,
  IngredientTransaction,
  Order,
  OrderStatusTimelineEntry,
  Product,
  ProductLot,
  ProductCategory,
  Recipe,
  Role,
  User
} from '@/lib/types';

const CONFIGURED_API_URL =
  (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080';

const LOCAL_API_HOST_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/;

export function getApiUrl() {
  if (typeof window === 'undefined') {
    return CONFIGURED_API_URL;
  }

  try {
    const configured = new URL(CONFIGURED_API_URL);
    const pageHost = window.location.hostname;
    if (LOCAL_API_HOST_PATTERN.test(configured.hostname) && !LOCAL_API_HOST_PATTERN.test(pageHost)) {
      return '';
    }
  } catch {
    // Fall back below if the configured value is malformed.
  }

  return CONFIGURED_API_URL;
}

export const API_URL = CONFIGURED_API_URL;

class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || undefined);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    credentials: 'include',
    headers
  } satisfies RequestInit);

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let details: unknown = null;
    try {
      const data = await response.json();
      message = data.message || message;
      details = data.details;
    } catch {
      // keep default
    }
    throw new ApiError(message, response.status, details);
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
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
  adjustIngredientStock: (
    id: string,
    payload: {
      type: 'IN' | 'OUT';
      qty: number;
      inputUnit?: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
      totalCost?: number;
      note?: string;
    }
  ) =>
    request<Ingredient>(`/api/admin/ingredients/${id}/stock-adjustments`, { method: 'POST', body: JSON.stringify(payload) }),
  listIngredientTransactions: (params: { ingredientId?: string; type?: 'IN' | 'OUT'; q?: string; from?: string; to?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.ingredientId) search.set('ingredientId', params.ingredientId);
    if (params.type) search.set('type', params.type);
    if (params.q) search.set('q', params.q);
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);
    if (params.limit != null) search.set('limit', String(params.limit));
    const query = search.toString();
    return request<IngredientTransaction[]>(`/api/admin/ingredients/transactions${query ? `?${query}` : ''}`);
  },
  deleteIngredient: (id: string) => request<void>(`/api/admin/ingredients/${id}`, { method: 'DELETE' }),

  listProductsAdmin: () => request<Product[]>('/api/admin/products'),
  listProductCategories: () => request<ProductCategory[]>('/api/admin/product-categories'),
  createProductCategory: (name: string) =>
    request<ProductCategory>('/api/admin/product-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  updateProductCategory: (id: string, name: string) =>
    request<ProductCategory>(`/api/admin/product-categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteProductCategory: (id: string) => request<void>(`/api/admin/product-categories/${id}`, { method: 'DELETE' }),
  nextProductSku: (category: string) =>
    request<{ sku: string }>(`/api/admin/products/next-sku?category=${encodeURIComponent(category)}`),
  listProductLotsAdmin: (id: string) => request<ProductLot[]>(`/api/admin/products/${id}/lots`),
  createProduct: (payload: Partial<Product>) => request<Product>('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id: string, payload: Partial<Product>) => request<Product>(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id: string) => request<void>(`/api/admin/products/${id}`, { method: 'DELETE' }),
  uploadProductImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${getApiUrl()}/api/admin/products/images/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      let details: unknown = null;
      try {
        const data = await response.json();
        message = data.message || message;
        details = data.details;
      } catch {
        // keep default
      }
      throw new ApiError(message, response.status, details);
    }

    return response.json() as Promise<{ fileName: string; path: string; url: string }>;
  },
  listMediaImages: () => request<MediaImage[]>('/api/admin/media/images'),
  deleteMediaImage: (fileName: string) =>
    request<void>(`/api/admin/media/images/${encodeURIComponent(fileName)}`, { method: 'DELETE' }),

  listRecipes: () => request<Recipe[]>('/api/admin/recipes'),
  createRecipe: (payload: unknown) => request<Recipe>('/api/admin/recipes', { method: 'POST', body: JSON.stringify(payload) }),
  updateRecipe: (id: string, payload: unknown) => request<Recipe>(`/api/admin/recipes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRecipe: (id: string) => request<void>(`/api/admin/recipes/${id}`, { method: 'DELETE' }),

  produceBake: (payload: unknown) => request<BakeRecord>('/api/admin/bakes', { method: 'POST', body: JSON.stringify(payload) }),
  listBakes: () => request<BakeRecord[]>('/api/admin/bakes'),

  createOrder: (payload: unknown, idempotencyKey?: string) =>
    request<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined
    }),
  listMyOrders: () => request<Order[]>('/api/orders'),

  listOrdersAdmin: (params: { status?: string; buyerName?: string; from?: string; to?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.buyerName) search.set('buyerName', params.buyerName);
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);
    const query = search.toString();
    return request<Order[]>(`/api/admin/orders${query ? `?${query}` : ''}`);
  },
  getOrderTimelineAdmin: (id: string) => request<OrderStatusTimelineEntry[]>(`/api/admin/orders/${id}/timeline`),
  updateOrderStatus: (id: string, status: string) => request<Order>(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  listUsersAdmin: () => request<AdminManagedUser[]>('/api/admin/users'),
  createUserAdmin: (payload: { email: string; fullName: string; password: string; roles: Role[] }) =>
    request<AdminManagedUser>('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUserAdmin: (id: string, payload: { fullName: string; password?: string; roles: Role[] }) =>
    request<AdminManagedUser>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUserAdmin: (id: string) => request<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  listAuditLogs: (params: { module?: string; action?: string; q?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.module) search.set('module', params.module);
    if (params.action) search.set('action', params.action);
    if (params.q) search.set('q', params.q);
    if (params.limit != null) search.set('limit', String(params.limit));
    const query = search.toString();
    return request<AuditLogListItem[]>(`/api/admin/audit-logs${query ? `?${query}` : ''}`);
  },
  getAuditLog: (id: string) => request<AuditLogDetail>(`/api/admin/audit-logs/${id}`),

  unlockDatabaseConsole: (password: string) =>
    request<DatabaseUnlockResponse>('/api/admin/database/unlock', { method: 'POST', body: JSON.stringify({ password }) }),
  listDatabaseCollections: (accessToken: string) =>
    request<DatabaseCollection[]>('/api/admin/database/collections', {
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  listDatabaseCollectionFields: (accessToken: string, collection: string) =>
    request<DatabaseCollectionFields>(`/api/admin/database/collections/${encodeURIComponent(collection)}/fields`, {
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  queryDatabase: (
    accessToken: string,
    payload: {
      collection: string;
      filters?: DatabaseFilterCondition[];
      page?: number;
      pageSize?: number;
      sortField?: string;
      sortDirection?: 'ASC' | 'DESC';
    }
  ) =>
    request<DatabaseQueryResponse>('/api/admin/database/query', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken },
      body: JSON.stringify(payload)
    }),
  updateDatabaseDocument: (accessToken: string, collection: string, id: string, document: Record<string, unknown>) =>
    request<DatabaseQueryRow>(`/api/admin/database/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'X-Database-Access-Token': accessToken },
      body: JSON.stringify({ document })
    }),
  deleteDatabaseDocument: (accessToken: string, collection: string, id: string) =>
    request<void>(`/api/admin/database/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  checkDatabaseDependencies: (accessToken: string, collection: string, documentId: string) =>
    request<DatabaseDependencyCheckResponse>('/api/admin/database/dependencies/check', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken },
      body: JSON.stringify({ collection, documentId })
    }),
  resolveDatabaseDependencies: (
    accessToken: string,
    payload: {
      targetCollection: string;
      targetDocumentId: string;
      operations: DatabaseDependencyResolveOperation[];
    }
  ) =>
    request<DatabaseDependencyResolveResponse>('/api/admin/database/dependencies/resolve', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken },
      body: JSON.stringify(payload)
    }),
  wipeDatabaseData: (
    accessToken: string,
    payload: {
      scope: 'COLLECTION' | 'DATABASE';
      collection?: string;
      confirmText: string;
    }
  ) =>
    request<DatabaseWipeResponse>('/api/admin/database/wipe', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken },
      body: JSON.stringify(payload)
    }),
  backupDatabase: (accessToken: string) =>
    request<DatabaseBackupResponse>('/api/admin/database/backup', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  getDatabaseBackupDirectory: (accessToken: string) =>
    request<DatabaseBackupDirectory>('/api/admin/database/backup-directory', {
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  openDatabaseBackupDirectory: (accessToken: string) =>
    request<DatabaseOpenDirectoryResponse>('/api/admin/database/backup-directory/open', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  listDatabaseBackups: (accessToken: string, source: DatabaseBackupSource = 'LOCAL') =>
    request<DatabaseBackupFileSummary[]>(`/api/admin/database/backups?source=${encodeURIComponent(source)}`, {
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  deleteDatabaseBackup: (accessToken: string, fileName: string, confirmText: string) =>
    request<DatabaseDeleteBackupResponse>('/api/admin/database/backups/delete', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken },
      body: JSON.stringify({ fileName, confirmText })
    }),
  getDatabaseBackupDetail: (accessToken: string, fileName: string, source: DatabaseBackupSource = 'LOCAL') =>
    request<DatabaseBackupDetail>(`/api/admin/database/backups/${encodeURIComponent(fileName)}?source=${encodeURIComponent(source)}`, {
      headers: { 'X-Database-Access-Token': accessToken }
    }),
  restoreDatabaseBackup: (accessToken: string, fileName: string, source: DatabaseBackupSource = 'LOCAL') =>
    request<DatabaseRestoreBackupResponse>('/api/admin/database/backups/restore', {
      method: 'POST',
      headers: { 'X-Database-Access-Token': accessToken },
      body: JSON.stringify({ fileName, source })
    }),
  exportDatabase: async (
    accessToken: string,
    format: 'csv' | 'xlsx',
    payload: {
      collection: string;
      filters?: DatabaseFilterCondition[];
      sortField?: string;
      sortDirection?: 'ASC' | 'DESC';
    }
  ) => {
    const response = await fetch(`${getApiUrl()}/api/admin/database/export?format=${encodeURIComponent(format)}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Database-Access-Token': accessToken
      },
      body: JSON.stringify(payload)
    });

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

    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition') || '';
    const fileNameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
    const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1].replace(/\"/g, '')) : `database-export.${format}`;

    return { blob, fileName };
  },

  getDashboard: () => request<DashboardData>('/api/dashboard')
};

export { ApiError };
