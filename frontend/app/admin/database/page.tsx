'use client';

import { FormEvent, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/components/language-context';
import {
  AdminManagedUser,
  BakeRecord,
  DatabaseBackupDetail,
  DatabaseBackupFileSummary,
  DatabaseBackupSource,
  DatabaseDependencyCheckResponse,
  DatabaseDependencyReference,
  DatabaseDependencyResolveOperation,
  DatabaseFilterCondition,
  DatabaseFilterOperator,
  DatabaseQueryRow,
  Ingredient,
  Product,
  ProductCategory,
  Recipe
} from '@/lib/types';

type UiFilter = DatabaseFilterCondition & { key: string };
type ViewMode = 'friendly' | 'raw';

type ReferenceData = {
  ingredientsById: Record<string, Ingredient>;
  productsById: Record<string, Product>;
  categoriesBySku: Record<string, ProductCategory>;
  usersById: Record<string, AdminManagedUser>;
  recipesById: Record<string, Recipe>;
  bakesById: Record<string, BakeRecord>;
};

type DisplayColumn = {
  id: string;
  label: string;
  field?: string;
  getValue: (document: Record<string, unknown>) => string;
};

type FieldOption = {
  value: string;
  label: string;
};

type ResolveMode = 'REMOVE' | 'REPLACE';

type ResolveRowState = {
  key: string;
  dependency: DatabaseDependencyReference;
  mode: ResolveMode;
  replacementDocumentId: string;
};

type ReplacementCandidate = {
  id: string;
  label: string;
};

const OPERATORS: DatabaseFilterOperator[] = [
  'EQ',
  'NE',
  'CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'EXISTS'
];

const EMPTY_REFERENCE_DATA: ReferenceData = {
  ingredientsById: {},
  productsById: {},
  categoriesBySku: {},
  usersById: {},
  recipesById: {},
  bakesById: {}
};

function serializeCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function asString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getNestedValue(target: unknown, path: string): unknown {
  if (!target || !path) return undefined;
  const parts = path.split('.');
  let current: unknown = target;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatDateTime(value: unknown): string {
  const raw = asString(value);
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString();
}

function formatDecimal(value: unknown): string {
  const num = asNumber(value);
  if (num == null) return '-';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(num);
}

function shortId(value: unknown): string {
  const text = asString(value);
  if (!text) return '-';
  return text.length > 12 ? `${text.slice(0, 12)}...` : text;
}

function prettifyFieldName(field: string): string {
  return field
    .replace(/\./g, ' > ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

function collectionDisplayName(collection: string, t: (key: string) => string): string {
  switch (collection) {
    case 'ingredients':
      return t('admin.nav.ingredients');
    case 'products':
      return t('admin.nav.products');
    case 'product_categories':
      return t('admin.products.categoriesTitle');
    case 'recipes':
      return t('admin.nav.recipes');
    case 'recipe_revisions':
      return t('admin.database.collection.recipeRevisions');
    case 'orders':
      return t('admin.nav.orders');
    case 'users':
      return t('admin.nav.users');
    case 'bake_records':
      return t('admin.nav.production');
    case 'product_lots':
      return t('admin.products.lotsTitle');
    case 'ingredient_stock_transactions':
      return t('admin.ingredients.txTitle');
    case 'product_stock_logs':
      return t('admin.database.collection.productStockLogs');
    case 'audit_logs':
      return t('admin.nav.history');
    default:
      return collection;
  }
}

function documentCandidateLabel(id: string, document: Record<string, unknown>): string {
  const preferred = ['name', 'title', 'email', 'sku', 'ingredientCode', 'lotCode', 'productId', 'recipeId'];
  for (const field of preferred) {
    const value = asString(document[field]);
    if (value) {
      return `${value} (${shortId(id)})`;
    }
  }
  return shortId(id);
}

function dependencyRowKey(collection: string, documentId: string): string {
  return `${collection}::${documentId}`;
}

function normalizeDependencyFieldPath(fieldPath: string): string {
  return fieldPath.replace(/\[(\d+)]/g, '.$1');
}

function toSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export default function AdminDatabasePage() {
  const { t } = useI18n();

  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [sessionExpiresAt, setSessionExpiresAt] = useState('');

  const [collections, setCollections] = useState<{ name: string; count: number }[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [collectionFields, setCollectionFields] = useState<string[]>([]);
  const [collectionFieldsLoading, setCollectionFieldsLoading] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('friendly');

  const [filters, setFilters] = useState<UiFilter[]>([]);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');

  const [rows, setRows] = useState<DatabaseQueryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const [referenceData, setReferenceData] = useState<ReferenceData>(EMPTY_REFERENCE_DATA);

  const [infoMessage, setInfoMessage] = useState('');
  const [successPopupOpen, setSuccessPopupOpen] = useState(false);
  const [successPopupMessage, setSuccessPopupMessage] = useState('');
  const [backupRunning, setBackupRunning] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [backupListOpen, setBackupListOpen] = useState(false);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [backupList, setBackupList] = useState<DatabaseBackupFileSummary[]>([]);
  const [backupSource, setBackupSource] = useState<DatabaseBackupSource>('LOCAL');
  const [backupDetailOpen, setBackupDetailOpen] = useState(false);
  const [backupDetailLoading, setBackupDetailLoading] = useState(false);
  const [backupDetail, setBackupDetail] = useState<DatabaseBackupDetail | null>(null);
  const [backupError, setBackupError] = useState('');
  const [backupDirectoryPath, setBackupDirectoryPath] = useState('');
  const [backupDirectoryOpen, setBackupDirectoryOpen] = useState(false);
  const [backupDirectoryLoading, setBackupDirectoryLoading] = useState(false);
  const [backupDirectoryOpening, setBackupDirectoryOpening] = useState(false);
  const [deleteBackupOpen, setDeleteBackupOpen] = useState(false);
  const [deleteBackupFileName, setDeleteBackupFileName] = useState('');
  const [deleteBackupConfirmText, setDeleteBackupConfirmText] = useState('');
  const [deletingBackup, setDeletingBackup] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DatabaseQueryRow | null>(null);
  const [editingCollection, setEditingCollection] = useState('');
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [dependencyWarningOpen, setDependencyWarningOpen] = useState(false);
  const [dependencyResolveOpen, setDependencyResolveOpen] = useState(false);
  const [dependencyLoading, setDependencyLoading] = useState(false);
  const [dependencySaving, setDependencySaving] = useState(false);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<DatabaseQueryRow | null>(null);
  const [dependencyReport, setDependencyReport] = useState<DatabaseDependencyCheckResponse | null>(null);
  const [resolveRows, setResolveRows] = useState<ResolveRowState[]>([]);
  const [replacementCandidates, setReplacementCandidates] = useState<ReplacementCandidate[]>([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [bulkReplacementDocumentId, setBulkReplacementDocumentId] = useState('');
  const [dependencyRowsByKey, setDependencyRowsByKey] = useState<Record<string, DatabaseQueryRow>>({});
  const [dependencyRowsLoading, setDependencyRowsLoading] = useState(false);

  const [wipeModalOpen, setWipeModalOpen] = useState(false);
  const [wipeScope, setWipeScope] = useState<'COLLECTION' | 'DATABASE'>('COLLECTION');
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeRollbackOpen, setWipeRollbackOpen] = useState(false);
  const [wipeRollbackMessage, setWipeRollbackMessage] = useState('');

  const isUnlocked = accessToken.length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const wipeExpectedConfirmText =
    wipeScope === 'DATABASE' ? 'WIPE DATABASE' : `WIPE COLLECTION ${selectedCollection || '<collection>'}`;
  const backupDeleteExpectedConfirm = deleteBackupFileName ? `DELETE BACKUP ${deleteBackupFileName}` : 'DELETE BACKUP <fileName>';

  const rawColumnNames = useMemo(() => {
    const fields = new Set<string>(['_id']);
    rows.forEach(row => {
      Object.keys(row.document || {}).forEach(key => fields.add(key));
    });
    return Array.from(fields);
  }, [rows]);

  const fieldPool = useMemo(() => {
    const fields = new Set<string>(collectionFields);
    rawColumnNames.forEach(field => fields.add(field));
    return Array.from(fields);
  }, [collectionFields, rawColumnNames]);

  const toPayloadFilters = (source: UiFilter[]): DatabaseFilterCondition[] =>
    source
      .map(item => ({
        field: item.field.trim(),
        operator: item.operator,
        value: item.value
      }))
      .filter(item => item.field.length > 0);

  const resolveUserLabel = (rawUser: unknown): string => {
    const value = asString(rawUser);
    if (!value) return 'system';
    if (value.includes('@')) return value;
    const user = referenceData.usersById[value];
    if (!user) return value;
    return user.fullName?.trim() ? `${user.fullName} (${user.email})` : user.email;
  };

  const resolveProductName = (rawId: unknown): string => {
    const id = asString(rawId);
    if (!id) return '-';
    return referenceData.productsById[id]?.name || id;
  };

  const resolveIngredientName = (rawId: unknown): string => {
    const id = asString(rawId);
    if (!id) return '-';
    return referenceData.ingredientsById[id]?.name || id;
  };

  const formatRecipeItems = (rawItems: unknown): string => {
    const items = asArray(rawItems);
    if (items.length === 0) return '-';
    return items
      .map(item => {
        const ingredientId = getNestedValue(item, 'ingredientId');
        const ingredientName = asString(getNestedValue(item, 'ingredientName')) || resolveIngredientName(ingredientId);
        const qty = getNestedValue(item, 'qtyPerBatch');
        const fallbackUnit = referenceData.ingredientsById[asString(ingredientId)]?.unit || '';
        const unit = asString(getNestedValue(item, 'unit')) || fallbackUnit;
        const qtyText = formatDecimal(qty);
        return `- ${ingredientName}: ${qtyText}${unit ? ` ${unit}` : ''}`;
      })
      .join('\n');
  };

  const formatOrderItems = (rawItems: unknown): string => {
    const items = asArray(rawItems);
    if (items.length === 0) return '-';
    return items
      .map(item => {
        const name = asString(getNestedValue(item, 'name')) || resolveProductName(getNestedValue(item, 'productId'));
        const qty = formatDecimal(getNestedValue(item, 'qty'));
        return `- ${name} x ${qty}`;
      })
      .join('\n');
  };

  const formatAllocations = (rawAllocations: unknown): string => {
    const allocations = asArray(rawAllocations);
    if (allocations.length === 0) return '-';
    return allocations
      .map(item => {
        const lot = asString(getNestedValue(item, 'lotCode')) || '-';
        const qty = formatDecimal(getNestedValue(item, 'qty'));
        const unitCost = formatDecimal(getNestedValue(item, 'unitCost'));
        return `- ${lot}: ${qty} (cost ${unitCost})`;
      })
      .join('\n');
  };

  const formatBakeDeductions = (rawDeductions: unknown): string => {
    const deductions = asArray(rawDeductions);
    if (deductions.length === 0) return '-';
    return deductions
      .map(item => {
        const name = asString(getNestedValue(item, 'ingredientName')) || resolveIngredientName(getNestedValue(item, 'ingredientId'));
        const qty = formatDecimal(getNestedValue(item, 'qty'));
        const unit = asString(getNestedValue(item, 'unit'));
        return `- ${name}: ${qty}${unit ? ` ${unit}` : ''}`;
      })
      .join('\n');
  };

  const resolveAuditEntity = (moduleRaw: unknown, entityRaw: unknown): string => {
    const moduleName = asString(moduleRaw).toUpperCase();
    const entityId = asString(entityRaw);
    if (!entityId) return '-';

    if (moduleName === 'PRODUCT') {
      const name = referenceData.productsById[entityId]?.name;
      return name ? `${name} (${shortId(entityId)})` : shortId(entityId);
    }
    if (moduleName === 'INGREDIENT') {
      const name = referenceData.ingredientsById[entityId]?.name;
      return name ? `${name} (${shortId(entityId)})` : shortId(entityId);
    }
    if (moduleName === 'RECIPE') {
      const recipe = referenceData.recipesById[entityId];
      const productName = recipe ? resolveProductName(recipe.productId) : '';
      return productName ? `${productName} (v${recipe.version || '-'})` : shortId(entityId);
    }
    if (moduleName === 'PRODUCTION') {
      const bake = referenceData.bakesById[entityId];
      if (!bake) return shortId(entityId);
      return `${resolveProductName(bake.productId)} (${shortId(entityId)})`;
    }
    if (moduleName === 'USER') {
      return resolveUserLabel(entityId);
    }

    return shortId(entityId);
  };

  const buildFriendlyColumnsForCollection = (collection: string, defaultFieldPool: string[]): DisplayColumn[] => {
    const buildDefaultColumns = () => {
      const fields = defaultFieldPool.filter(field => field !== '_class' && field !== 'passwordHash');
      if (!fields.includes('_id')) {
        fields.unshift('_id');
      }
      return fields.map(field => ({
        id: field,
        label: prettifyFieldName(field),
        field,
        getValue: (document: Record<string, unknown>) => serializeCell(getNestedValue(document, field))
      }));
    };

    switch (collection) {
      case 'ingredients':
        return [
          { id: 'ingredientCode', label: t('admin.ingredients.ingredientCode'), field: 'ingredientCode', getValue: doc => asString(doc.ingredientCode) || '-' },
          { id: 'name', label: t('admin.ingredients.name'), field: 'name', getValue: doc => asString(doc.name) || '-' },
          { id: 'unit', label: t('admin.ingredients.unit'), field: 'unit', getValue: doc => asString(doc.unit) || '-' },
          { id: 'currentStock', label: t('admin.ingredients.stock'), field: 'currentStock', getValue: doc => formatDecimal(doc.currentStock) },
          { id: 'reorderLevel', label: t('admin.ingredients.reorder'), field: 'reorderLevel', getValue: doc => formatDecimal(doc.reorderLevel) },
          { id: 'costTrackingMethod', label: t('admin.ingredients.costTracking'), field: 'costTrackingMethod', getValue: doc => asString(doc.costTrackingMethod) || '-' },
          { id: 'updatedAt', label: t('admin.history.time'), field: 'updatedAt', getValue: doc => formatDateTime(doc.updatedAt) }
        ];
      case 'products':
        return [
          { id: 'name', label: t('admin.products.name'), field: 'name', getValue: doc => asString(doc.name) || '-' },
          { id: 'sku', label: t('admin.products.sku'), field: 'sku', getValue: doc => asString(doc.sku) || '-' },
          {
            id: 'category',
            label: t('admin.products.category'),
            field: 'category',
            getValue: doc => {
              const category = asString(doc.category);
              if (!category) return '-';
              return referenceData.categoriesBySku[category]?.name || category;
            }
          },
          { id: 'price', label: t('admin.products.price'), field: 'price', getValue: doc => formatDecimal(doc.price) },
          { id: 'cost', label: t('admin.products.cost'), field: 'cost', getValue: doc => formatDecimal(doc.cost) },
          { id: 'currentStock', label: t('admin.products.stock'), field: 'currentStock', getValue: doc => formatDecimal(doc.currentStock) },
          {
            id: 'active',
            label: t('admin.products.status'),
            field: 'active',
            getValue: doc => (doc.active === false ? t('admin.products.hidden') : t('admin.products.active'))
          },
          { id: 'updatedAt', label: t('admin.history.time'), field: 'updatedAt', getValue: doc => formatDateTime(doc.updatedAt) }
        ];
      case 'product_categories':
        return [
          { id: 'name', label: t('admin.products.categoryName'), field: 'name', getValue: doc => asString(doc.name) || '-' },
          { id: 'sku', label: t('admin.products.categorySku'), field: 'sku', getValue: doc => asString(doc.sku) || '-' },
          {
            id: 'legacySkus',
            label: t('admin.products.legacyCategory'),
            field: 'legacySkus',
            getValue: doc => asArray(doc.legacySkus).map(item => asString(item)).filter(Boolean).join(', ') || '-'
          },
          { id: 'updatedAt', label: t('admin.history.time'), field: 'updatedAt', getValue: doc => formatDateTime(doc.updatedAt) }
        ];
      case 'recipes':
        return [
          { id: 'productId', label: t('admin.products.name'), field: 'productId', getValue: doc => resolveProductName(doc.productId) },
          { id: 'version', label: t('admin.recipes.version'), field: 'version', getValue: doc => formatDecimal(doc.version) },
          { id: 'yieldQty', label: t('admin.recipes.yield'), field: 'yieldQty', getValue: doc => formatDecimal(doc.yieldQty) },
          { id: 'items', label: t('admin.recipes.ingredients'), getValue: doc => formatRecipeItems(doc.items) },
          { id: 'updatedAt', label: t('admin.history.time'), field: 'updatedAt', getValue: doc => formatDateTime(doc.updatedAt) }
        ];
      case 'recipe_revisions':
        return [
          { id: 'recipeId', label: t('admin.database.column.recipe'), field: 'recipeId', getValue: doc => shortId(doc.recipeId) },
          { id: 'productId', label: t('admin.products.name'), field: 'productId', getValue: doc => resolveProductName(doc.productId) },
          { id: 'version', label: t('admin.recipes.version'), field: 'version', getValue: doc => formatDecimal(doc.version) },
          { id: 'yieldQty', label: t('admin.recipes.yield'), field: 'yieldQty', getValue: doc => formatDecimal(doc.yieldQty) },
          { id: 'items', label: t('admin.recipes.ingredients'), getValue: doc => formatRecipeItems(doc.items) },
          { id: 'changeType', label: t('admin.database.column.changeType'), field: 'changeType', getValue: doc => asString(doc.changeType) || '-' },
          { id: 'changedBy', label: t('admin.history.actor'), field: 'changedBy', getValue: doc => resolveUserLabel(doc.changedBy) },
          { id: 'changedAt', label: t('admin.history.time'), field: 'changedAt', getValue: doc => formatDateTime(doc.changedAt) }
        ];
      case 'orders':
        return [
          { id: '_id', label: t('admin.orders.order'), field: '_id', getValue: doc => shortId(doc._id) },
          {
            id: 'status',
            label: t('admin.orders.status'),
            field: 'status',
            getValue: doc => {
              const status = asString(doc.status);
              return status ? t(`status.${status}`) : '-';
            }
          },
          { id: 'recipientName', label: t('checkout.recipientName'), field: 'recipientName', getValue: doc => asString(doc.recipientName) || '-' },
          { id: 'recipientPhone', label: t('checkout.recipientPhone'), field: 'recipientPhone', getValue: doc => asString(doc.recipientPhone) || '-' },
          { id: 'deliveryAddress', label: t('checkout.deliveryAddress'), field: 'deliveryAddress', getValue: doc => asString(doc.deliveryAddress) || '-' },
          { id: 'items', label: t('admin.orders.items'), getValue: doc => formatOrderItems(doc.items) },
          { id: 'total', label: t('admin.orders.total'), field: 'total', getValue: doc => formatDecimal(doc.total) },
          { id: 'cancelReason', label: t('admin.orders.cancelReason'), field: 'cancelReason', getValue: doc => asString(doc.cancelReason) || '-' },
          { id: 'createdAt', label: t('admin.orders.created'), field: 'createdAt', getValue: doc => formatDateTime(doc.createdAt) }
        ];
      case 'ingredient_stock_transactions':
        return [
          {
            id: 'ingredientId',
            label: t('admin.ingredients.name'),
            field: 'ingredientId',
            getValue: doc => asString(doc.ingredientName) || resolveIngredientName(doc.ingredientId)
          },
          {
            id: 'type',
            label: t('admin.ingredients.txAction'),
            field: 'type',
            getValue: doc => {
              const type = asString(doc.type).toUpperCase();
              if (type === 'IN') return t('admin.ingredients.txIn');
              if (type === 'OUT') return t('admin.ingredients.txOut');
              return type || '-';
            }
          },
          {
            id: 'qty',
            label: t('admin.ingredients.txQty'),
            field: 'qty',
            getValue: doc => {
              const qty = formatDecimal(doc.qty);
              const unit = asString(doc.inputUnit) || asString(doc.ingredientUnit);
              return unit ? `${qty} ${unit}` : qty;
            }
          },
          { id: 'unitCost', label: t('admin.ingredients.lotUnitCost'), field: 'unitCost', getValue: doc => formatDecimal(doc.unitCost) },
          { id: 'lotCode', label: t('admin.ingredients.txLot'), field: 'lotCode', getValue: doc => asString(doc.lotCode) || '-' },
          { id: 'remainingQty', label: t('admin.ingredients.txRemaining'), field: 'remainingQty', getValue: doc => formatDecimal(doc.remainingQty) },
          { id: 'allocations', label: t('admin.database.column.allocations'), getValue: doc => formatAllocations(doc.allocations) },
          { id: 'createdBy', label: t('admin.ingredients.txBy'), field: 'createdBy', getValue: doc => resolveUserLabel(doc.createdBy) },
          { id: 'createdAt', label: t('admin.ingredients.txTime'), field: 'createdAt', getValue: doc => formatDateTime(doc.createdAt) }
        ];
      case 'product_stock_logs':
        return [
          { id: 'productId', label: t('admin.products.name'), field: 'productId', getValue: doc => resolveProductName(doc.productId) },
          { id: 'type', label: t('admin.ingredients.txAction'), field: 'type', getValue: doc => asString(doc.type) || '-' },
          { id: 'qty', label: t('admin.ingredients.txQty'), field: 'qty', getValue: doc => formatDecimal(doc.qty) },
          { id: 'note', label: t('admin.ingredients.restockNote'), field: 'note', getValue: doc => asString(doc.note) || '-' },
          { id: 'createdBy', label: t('admin.ingredients.txBy'), field: 'createdBy', getValue: doc => resolveUserLabel(doc.createdBy) },
          { id: 'createdAt', label: t('admin.ingredients.txTime'), field: 'createdAt', getValue: doc => formatDateTime(doc.createdAt) }
        ];
      case 'bake_records':
        return [
          { id: 'productId', label: t('admin.products.name'), field: 'productId', getValue: doc => resolveProductName(doc.productId) },
          { id: 'recipeId', label: t('admin.database.column.recipe'), field: 'recipeId', getValue: doc => shortId(doc.recipeId) },
          { id: 'factor', label: t('admin.database.column.factor'), field: 'factor', getValue: doc => formatDecimal(doc.factor) },
          { id: 'producedQty', label: t('admin.database.column.producedQty'), field: 'producedQty', getValue: doc => formatDecimal(doc.producedQty) },
          { id: 'totalIngredientCost', label: t('admin.database.column.totalIngredientCost'), field: 'totalIngredientCost', getValue: doc => formatDecimal(doc.totalIngredientCost) },
          { id: 'producedUnitCost', label: t('admin.database.column.unitCost'), field: 'producedUnitCost', getValue: doc => formatDecimal(doc.producedUnitCost) },
          { id: 'deductions', label: t('admin.database.column.deductions'), getValue: doc => formatBakeDeductions(doc.deductions) },
          { id: 'createdBy', label: t('admin.ingredients.txBy'), field: 'createdBy', getValue: doc => resolveUserLabel(doc.createdBy) },
          { id: 'createdAt', label: t('admin.history.time'), field: 'createdAt', getValue: doc => formatDateTime(doc.createdAt) }
        ];
      case 'product_lots':
        return [
          { id: 'lotCode', label: t('admin.products.lotCode'), field: 'lotCode', getValue: doc => asString(doc.lotCode) || '-' },
          { id: 'productId', label: t('admin.products.name'), field: 'productId', getValue: doc => resolveProductName(doc.productId) },
          { id: 'bakeRecordId', label: t('admin.database.column.bakeRecord'), field: 'bakeRecordId', getValue: doc => shortId(doc.bakeRecordId) },
          { id: 'recipeVersion', label: t('admin.recipes.version'), field: 'recipeVersion', getValue: doc => formatDecimal(doc.recipeVersion) },
          { id: 'producedQty', label: t('admin.products.lotProducedQty'), field: 'producedQty', getValue: doc => formatDecimal(doc.producedQty) },
          { id: 'remainingQty', label: t('admin.products.lotRemainingQty'), field: 'remainingQty', getValue: doc => formatDecimal(doc.remainingQty) },
          { id: 'unitCost', label: t('admin.products.lotUnitCost'), field: 'unitCost', getValue: doc => formatDecimal(doc.unitCost) },
          { id: 'totalCost', label: t('admin.products.lotTotalCost'), field: 'totalCost', getValue: doc => formatDecimal(doc.totalCost) },
          { id: 'producedAt', label: t('admin.products.lotProducedAt'), field: 'producedAt', getValue: doc => formatDateTime(doc.producedAt) },
          { id: 'note', label: t('admin.ingredients.restockNote'), field: 'note', getValue: doc => asString(doc.note) || '-' }
        ];
      case 'users':
        return [
          { id: 'fullName', label: t('admin.users.fullName'), field: 'fullName', getValue: doc => asString(doc.fullName) || '-' },
          { id: 'email', label: t('admin.users.email'), field: 'email', getValue: doc => asString(doc.email) || '-' },
          {
            id: 'roles',
            label: t('admin.users.roles'),
            field: 'roles',
            getValue: doc => asArray(doc.roles).map(role => asString(role)).filter(Boolean).join(', ') || '-'
          },
          { id: 'createdAt', label: t('admin.users.createdAt'), field: 'createdAt', getValue: doc => formatDateTime(doc.createdAt) }
        ];
      case 'audit_logs':
        return [
          { id: 'title', label: t('admin.history.title'), field: 'title', getValue: doc => asString(doc.title) || '-' },
          { id: 'module', label: t('admin.history.module'), field: 'module', getValue: doc => asString(doc.module) || '-' },
          { id: 'action', label: t('admin.history.action'), field: 'action', getValue: doc => asString(doc.action) || '-' },
          {
            id: 'entityId',
            label: t('admin.database.column.entity'),
            field: 'entityId',
            getValue: doc => resolveAuditEntity(doc.module, doc.entityId)
          },
          {
            id: 'actorEmail',
            label: t('admin.history.actor'),
            field: 'actorEmail',
            getValue: doc => asString(doc.actorEmail) || resolveUserLabel(doc.actorId)
          },
          { id: 'createdAt', label: t('admin.history.time'), field: 'createdAt', getValue: doc => formatDateTime(doc.createdAt) }
        ];
      default:
        return buildDefaultColumns();
    }
  };

  const friendlyColumns = buildFriendlyColumnsForCollection(selectedCollection, fieldPool);

  const rawColumns = useMemo<DisplayColumn[]>(() => {
    return rawColumnNames.map(field => ({
      id: field,
      label: field,
      field,
      getValue: (document: Record<string, unknown>) => serializeCell(document[field])
    }));
  }, [rawColumnNames]);

  const activeColumns = viewMode === 'friendly' ? friendlyColumns : rawColumns;

  const fieldOptions = useMemo<FieldOption[]>(() => {
    if (viewMode === 'friendly') {
      const labels = new Map<string, string>();
      friendlyColumns.forEach(column => {
        if (column.field && !labels.has(column.field)) {
          labels.set(column.field, column.label);
        }
      });
      return Array.from(labels.entries()).map(([value, label]) => ({ value, label }));
    }

    return fieldPool.map(field => ({ value: field, label: field }));
  }, [viewMode, friendlyColumns, fieldPool]);

  const handleSessionError = (err: unknown, fallbackMessage: string) => {
    const message = err instanceof Error ? err.message : fallbackMessage;
    if (err instanceof ApiError && err.status === 401) {
      setUnlockError(t('admin.database.sessionExpired'));
      setAccessToken('');
      setSessionExpiresAt('');
      setCollections([]);
      setSelectedCollection('');
      setRows([]);
      setTotal(0);
      setReferenceData(EMPTY_REFERENCE_DATA);
      return;
    }
    setQueryError(message);
  };

  const showSuccessPopup = (message: string) => {
    setInfoMessage(message);
    setSuccessPopupMessage(message);
    setSuccessPopupOpen(true);
  };

  const loadReferenceData = async () => {
    const [ingredients, products, categories, users, recipes, bakes] = await Promise.all([
      api.listIngredients().catch(() => [] as Ingredient[]),
      api.listProductsAdmin().catch(() => [] as Product[]),
      api.listProductCategories().catch(() => [] as ProductCategory[]),
      api.listUsersAdmin().catch(() => [] as AdminManagedUser[]),
      api.listRecipes().catch(() => [] as Recipe[]),
      api.listBakes().catch(() => [] as BakeRecord[])
    ]);

    const nextReference: ReferenceData = {
      ingredientsById: Object.fromEntries(ingredients.map(item => [item.id, item])),
      productsById: Object.fromEntries(products.map(item => [item.id, item])),
      categoriesBySku: Object.fromEntries(categories.map(item => [item.sku, item])),
      usersById: Object.fromEntries(users.map(item => [item.id, item])),
      recipesById: Object.fromEntries(recipes.map(item => [item.id, item])),
      bakesById: Object.fromEntries(bakes.map(item => [item.id, item]))
    };

    setReferenceData(nextReference);
  };

  const loadCollections = async (token: string) => {
    setCollectionsLoading(true);
    try {
      const list = await api.listDatabaseCollections(token);
      setCollections(list);
      setSelectedCollection('');
      setCollectionFields([]);
      setRows([]);
      setTotal(0);
      setPage(1);
      setQueryError('');
    } catch (err) {
      setCollections([]);
      setSelectedCollection('');
      setCollectionFields([]);
      setQueryError(err instanceof Error ? err.message : t('admin.database.collectionFailed'));
    } finally {
      setCollectionsLoading(false);
    }
  };

  const loadCollectionFields = async (token: string, collection: string) => {
    setCollectionFieldsLoading(true);
    try {
      const response = await api.listDatabaseCollectionFields(token, collection);
      setCollectionFields(response.fields || []);
    } catch (err) {
      setCollectionFields([]);
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setCollectionFieldsLoading(false);
    }
  };

  const runQuery = async (params?: {
    token?: string;
    collection?: string;
    nextPage?: number;
    nextPageSize?: number;
    nextFilters?: UiFilter[];
    nextSortField?: string;
    nextSortDirection?: 'ASC' | 'DESC';
  }) => {
    const token = params?.token ?? accessToken;
    const collection = params?.collection ?? selectedCollection;
    const targetPage = params?.nextPage ?? page;
    const targetPageSize = params?.nextPageSize ?? pageSize;
    const targetFilters = params?.nextFilters ?? filters;
    const targetSortField = params?.nextSortField ?? sortField;
    const targetSortDirection = params?.nextSortDirection ?? sortDirection;

    if (!token || !collection) {
      return;
    }

    setLoadingRows(true);
    try {
      const response = await api.queryDatabase(token, {
        collection,
        filters: toPayloadFilters(targetFilters),
        page: targetPage,
        pageSize: targetPageSize,
        sortField: targetSortField || undefined,
        sortDirection: targetSortDirection
      });
      setRows(response.rows);
      setTotal(response.total);
      setPage(response.page);
      setPageSize(response.pageSize);
      setQueryError('');
    } catch (err) {
      handleSessionError(err, t('admin.database.queryFailed'));
    } finally {
      setLoadingRows(false);
    }
  };

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError('');
    try {
      const result = await api.unlockDatabaseConsole(unlockPassword);
      setAccessToken(result.accessToken);
      setSessionExpiresAt(result.expiresAt);
      setInfoMessage(t('admin.database.autoBackupDone', { file: result.backupFileName }));
      setUnlockPassword('');
      await Promise.all([loadCollections(result.accessToken), loadReferenceData()]);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : t('admin.database.unlockFailed'));
    } finally {
      setUnlocking(false);
    }
  };

  const addFilter = () => {
    if (fieldOptions.length === 0) {
      return;
    }
    setFilters(current => [
      ...current,
      {
        key: `${Date.now()}-${Math.random()}`,
        field: fieldOptions[0].value,
        operator: 'EQ',
        value: ''
      }
    ]);
  };

  const updateFilter = (key: string, patch: Partial<UiFilter>) => {
    setFilters(current => current.map(item => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeFilter = (key: string) => {
    setFilters(current => current.filter(item => item.key !== key));
  };

  const applySearch = async (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    await runQuery({ nextPage: 1 });
  };

  const resetFilters = async () => {
    const emptyFilters: UiFilter[] = [];
    setFilters(emptyFilters);
    setSortField('');
    setSortDirection('DESC');
    setPage(1);
    setQueryError('');
    await runQuery({ nextPage: 1, nextFilters: emptyFilters, nextSortField: '', nextSortDirection: 'DESC' });
  };

  const switchViewMode = async (nextMode: ViewMode) => {
    if (viewMode === nextMode) {
      return;
    }
    const emptyFilters: UiFilter[] = [];
    setViewMode(nextMode);
    setFilters(emptyFilters);
    setSortField('');
    setPage(1);
    if (selectedCollection) {
      await runQuery({ nextPage: 1, nextFilters: emptyFilters, nextSortField: '' });
    }
  };

  const openEdit = (row: DatabaseQueryRow, collection = selectedCollection) => {
    setEditingRow(row);
    setEditingCollection(collection);
    setEditText(JSON.stringify(row.document, null, 2));
    setEditError('');
    setEditOpen(true);
  };

  const getDependencyRowId = (dependency: DatabaseDependencyReference): string =>
    dependencyRowKey(dependency.collection, dependency.documentId);

  const findDocumentByCollectionAndId = async (collection: string, id: string): Promise<DatabaseQueryRow | null> => {
    const response = await api.queryDatabase(accessToken, {
      collection,
      filters: [{ field: '_id', operator: 'EQ', value: id }],
      page: 1,
      pageSize: 1,
      sortField: '_id',
      sortDirection: 'DESC'
    });
    return response.rows[0] ?? null;
  };

  const loadDependencyRows = async (report: DatabaseDependencyCheckResponse) => {
    setDependencyRowsLoading(true);
    try {
      const uniqueDependencies = new Map<string, DatabaseDependencyReference>();
      report.dependencies.forEach(dependency => {
        uniqueDependencies.set(getDependencyRowId(dependency), dependency);
      });

      const fetched = await Promise.all(
        Array.from(uniqueDependencies.values()).map(async dependency => {
          try {
            const row = await findDocumentByCollectionAndId(dependency.collection, dependency.documentId);
            return { key: getDependencyRowId(dependency), row };
          } catch {
            return { key: getDependencyRowId(dependency), row: null };
          }
        })
      );

      const nextMap: Record<string, DatabaseQueryRow> = {};
      fetched.forEach(item => {
        if (item.row) {
          nextMap[item.key] = item.row;
        }
      });
      setDependencyRowsByKey(nextMap);
    } finally {
      setDependencyRowsLoading(false);
    }
  };

  const makeResolveRows = (report: DatabaseDependencyCheckResponse): ResolveRowState[] =>
    report.dependencies.map((dependency, index) => ({
      key: `${dependency.collection}-${dependency.documentId}-${dependency.fieldPath}-${index}`,
      dependency,
      mode: 'REMOVE',
      replacementDocumentId: ''
    }));

  const parseDependencyReportFromError = (err: unknown): DatabaseDependencyCheckResponse | null => {
    if (!(err instanceof ApiError)) {
      return null;
    }
    if (err.status !== 409 || typeof err.details !== 'object' || err.details == null) {
      return null;
    }
    const detailObj = err.details as { dependencyInfo?: DatabaseDependencyCheckResponse };
    if (!detailObj.dependencyInfo || !Array.isArray(detailObj.dependencyInfo.dependencies)) {
      return null;
    }
    return detailObj.dependencyInfo;
  };

  const loadReplacementCandidates = async (collection: string, targetId: string) => {
    setReplacementLoading(true);
    try {
      const response = await api.queryDatabase(accessToken, {
        collection,
        page: 1,
        pageSize: 200,
        sortField: '_id',
        sortDirection: 'DESC'
      });
      const candidates = response.rows
        .filter(row => row.id !== targetId)
        .map(row => ({
          id: row.id,
          label: documentCandidateLabel(row.id, row.document)
        }));
      setReplacementCandidates(candidates);
      setBulkReplacementDocumentId(candidates[0]?.id ?? '');
      setResolveRows(current =>
        current.map(item => ({
          ...item,
          replacementDocumentId: item.replacementDocumentId || candidates[0]?.id || ''
        }))
      );
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
      setReplacementCandidates([]);
      setBulkReplacementDocumentId('');
    } finally {
      setReplacementLoading(false);
    }
  };

  const closeDependencyModals = () => {
    setDependencyWarningOpen(false);
    setDependencyResolveOpen(false);
    setDependencyReport(null);
    setResolveRows([]);
    setReplacementCandidates([]);
    setBulkReplacementDocumentId('');
    setDependencyRowsByKey({});
    setPendingDeleteRow(null);
  };

  const saveEdit = async () => {
    const targetCollection = editingCollection || selectedCollection;
    if (!editingRow || !targetCollection) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editText) as Record<string, unknown>;
    } catch {
      setEditError(t('admin.database.invalidJson'));
      return;
    }
    setSavingEdit(true);
    try {
      await api.updateDatabaseDocument(accessToken, targetCollection, editingRow.id, parsed);
      setEditOpen(false);
      if (targetCollection === selectedCollection) {
        await runQuery();
      }

      if (dependencyResolveOpen && dependencyReport) {
        const refreshedReport = await api.checkDatabaseDependencies(
          accessToken,
          dependencyReport.targetCollection,
          dependencyReport.targetDocumentId
        );
        setDependencyReport(refreshedReport);
        setResolveRows(makeResolveRows(refreshedReport));
        await loadDependencyRows(refreshedReport);
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteRow = async (row: DatabaseQueryRow) => {
    if (!selectedCollection) return;
    setDependencyLoading(true);
    setPendingDeleteRow(row);
    try {
      const dependencyInfo = await api.checkDatabaseDependencies(accessToken, selectedCollection, row.id);
      if (dependencyInfo.dependencyCount > 0) {
        setDependencyReport(dependencyInfo);
        setResolveRows(makeResolveRows(dependencyInfo));
        setDependencyWarningOpen(true);
        return;
      }

      const confirmed = window.confirm(t('admin.database.deleteConfirm'));
      if (!confirmed) {
        setPendingDeleteRow(null);
        return;
      }
      await api.deleteDatabaseDocument(accessToken, selectedCollection, row.id);
      setPendingDeleteRow(null);
      await runQuery();
      showSuccessPopup(t('admin.database.deleteSuccess'));
    } catch (err) {
      const dependencyInfo = parseDependencyReportFromError(err);
      if (dependencyInfo) {
        setDependencyReport(dependencyInfo);
        setResolveRows(makeResolveRows(dependencyInfo));
        setDependencyWarningOpen(true);
        return;
      }
      handleSessionError(err, t('admin.database.queryFailed'));
    } finally {
      setDependencyLoading(false);
    }
  };

  const openDependencyResolveModal = async () => {
    if (!dependencyReport) {
      return;
    }
    setDependencyWarningOpen(false);
    setDependencyResolveOpen(true);
    setResolveRows(makeResolveRows(dependencyReport));
    await Promise.all([
      loadReplacementCandidates(dependencyReport.targetCollection, dependencyReport.targetDocumentId),
      loadDependencyRows(dependencyReport)
    ]);
  };

  const setResolveRowMode = (key: string, mode: ResolveMode) => {
    setResolveRows(current =>
      current.map(item =>
        item.key === key
          ? {
              ...item,
              mode
            }
          : item
      )
    );
  };

  const setResolveRowReplacement = (key: string, replacementDocumentId: string) => {
    setResolveRows(current =>
      current.map(item =>
        item.key === key
          ? {
              ...item,
              replacementDocumentId
            }
          : item
      )
    );
  };

  const applyBulkRemove = () => {
    setResolveRows(current =>
      current.map(item => ({
        ...item,
        mode: 'REMOVE'
      }))
    );
  };

  const applyBulkReplace = () => {
    if (!bulkReplacementDocumentId) {
      return;
    }
    setResolveRows(current =>
      current.map(item => ({
        ...item,
        mode: 'REPLACE',
        replacementDocumentId: bulkReplacementDocumentId
      }))
    );
  };

  const applyDependencyResolution = async () => {
    if (!dependencyReport || !pendingDeleteRow) {
      return;
    }

    const operations: DatabaseDependencyResolveOperation[] = resolveRows.map(item => ({
        collection: item.dependency.collection,
        documentId: item.dependency.documentId,
        fieldPath: item.dependency.fieldPath,
        action: item.mode === 'REMOVE' ? 'REMOVE' : 'REPLACE',
        replacementCollection: item.mode === 'REPLACE' ? dependencyReport.targetCollection : undefined,
        replacementDocumentId: item.mode === 'REPLACE' ? item.replacementDocumentId : undefined
      }));

    if (operations.some(item => item.action === 'REPLACE' && !item.replacementDocumentId)) {
      setQueryError(t('admin.database.resolveMissingReplacement'));
      return;
    }

    setDependencySaving(true);
    try {
      await api.resolveDatabaseDependencies(accessToken, {
        targetCollection: dependencyReport.targetCollection,
        targetDocumentId: dependencyReport.targetDocumentId,
        operations
      });

      const afterResolve = await api.checkDatabaseDependencies(
        accessToken,
        dependencyReport.targetCollection,
        dependencyReport.targetDocumentId
      );

      if (afterResolve.dependencyCount > 0) {
        setDependencyReport(afterResolve);
        setResolveRows(makeResolveRows(afterResolve));
        await loadDependencyRows(afterResolve);
        setInfoMessage(t('admin.database.resolvePartial', { count: afterResolve.dependencyCount }));
        return;
      }

      await api.deleteDatabaseDocument(accessToken, dependencyReport.targetCollection, dependencyReport.targetDocumentId);
      showSuccessPopup(t('admin.database.resolveAndDeleteSuccess'));
      closeDependencyModals();
      await runQuery();
    } catch (err) {
      const dependencyInfo = parseDependencyReportFromError(err);
      if (dependencyInfo) {
        setDependencyReport(dependencyInfo);
        setResolveRows(makeResolveRows(dependencyInfo));
        await loadDependencyRows(dependencyInfo);
        setInfoMessage(t('admin.database.resolvePartial', { count: dependencyInfo.dependencyCount }));
        return;
      }
      handleSessionError(err, t('admin.database.queryFailed'));
    } finally {
      setDependencySaving(false);
    }
  };

  const openWipeModal = (scope: 'COLLECTION' | 'DATABASE') => {
    if (scope === 'COLLECTION' && !selectedCollection) {
      return;
    }
    setWipeScope(scope);
    setWipeConfirmText('');
    setWipeModalOpen(true);
  };

  const executeWipe = async () => {
    if (!selectedCollection && wipeScope === 'COLLECTION') {
      return;
    }
    setWiping(true);
    try {
      const result = await api.wipeDatabaseData(accessToken, {
        scope: wipeScope,
        collection: wipeScope === 'COLLECTION' ? selectedCollection : undefined,
        confirmText: wipeConfirmText
      });
      setWipeModalOpen(false);
      setWipeConfirmText('');
      setInfoMessage(
        t('admin.database.wipeSuccess', {
          scope: result.scope === 'DATABASE' ? t('admin.database.wipeDatabaseLabel') : result.collection || selectedCollection,
          count: result.deletedDocuments
        })
      );
      await Promise.all([loadCollections(accessToken), loadReferenceData()]);
      if (backupListOpen) {
        await loadBackupList();
      }
    } catch (err) {
      if (err instanceof ApiError && typeof err.details === 'object' && err.details != null) {
        const detailObj = err.details as { code?: string; reason?: string; backupFile?: string };
        if (detailObj.code === 'WIPE_ROLLBACK') {
          setWipeRollbackMessage(
            t('admin.database.wipeRollbackMessage', {
              reason: detailObj.reason || t('admin.database.queryFailed'),
              backup: detailObj.backupFile || '-'
            })
          );
          setWipeRollbackOpen(true);
        }
      }
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setWiping(false);
    }
  };

  const runManualBackup = async () => {
    setBackupRunning(true);
    try {
      const result = await api.backupDatabase(accessToken);
      setInfoMessage(t('admin.database.backupSuccess', { file: result.fileName }));
      if (backupListOpen) {
        await loadBackupList();
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupRunning(false);
    }
  };

  const loadBackupDirectory = async () => {
    setBackupDirectoryLoading(true);
    try {
      const result = await api.getDatabaseBackupDirectory(accessToken);
      setBackupDirectoryPath(result.directoryPath);
      setBackupError('');
    } catch (err) {
      setBackupDirectoryPath('');
      setBackupError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupDirectoryLoading(false);
    }
  };

  const openBackupDirectoryModal = async () => {
    setBackupDirectoryOpen(true);
    if (!backupDirectoryPath) {
      await loadBackupDirectory();
    }
  };

  const copyBackupDirectoryPath = async () => {
    if (!backupDirectoryPath) return;
    try {
      await navigator.clipboard.writeText(backupDirectoryPath);
      setInfoMessage(t('admin.database.backupPathCopied'));
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    }
  };

  const openBackupFolderOnHost = async () => {
    setBackupDirectoryOpening(true);
    try {
      const response = await api.openDatabaseBackupDirectory(accessToken);
      if (response.message) {
        setInfoMessage(response.message);
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupDirectoryOpening(false);
    }
  };

  const loadBackupList = async (sourceOverride?: DatabaseBackupSource) => {
    setBackupListLoading(true);
    setBackupError('');
    try {
      const list = await api.listDatabaseBackups(accessToken, sourceOverride ?? backupSource);
      setBackupList(list);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupListLoading(false);
    }
  };

  const openBackupList = async () => {
    setBackupListOpen(true);
    await loadBackupList();
  };

  const requestDeleteBackup = (fileName: string) => {
    if (backupSource === 'DRIVE') {
      setBackupError(t('admin.database.backupDeleteDriveUnsupported'));
      return;
    }
    setDeleteBackupFileName(fileName);
    setDeleteBackupConfirmText('');
    setDeleteBackupOpen(true);
  };

  const deleteBackupFile = async () => {
    if (!deleteBackupFileName) return;
    setDeletingBackup(true);
    try {
      const deleted = await api.deleteDatabaseBackup(accessToken, deleteBackupFileName, deleteBackupConfirmText);
      setInfoMessage(t('admin.database.backupDeleteSuccess', { file: deleted.fileName }));
      setDeleteBackupOpen(false);
      setDeleteBackupFileName('');
      setDeleteBackupConfirmText('');
      await loadBackupList();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setDeletingBackup(false);
    }
  };

  const openBackupDetail = async (fileName: string) => {
    setBackupDetailOpen(true);
    setBackupDetailLoading(true);
    setBackupDetail(null);
    setBackupError('');
    try {
      const detail = await api.getDatabaseBackupDetail(accessToken, fileName, backupSource);
      setBackupDetail(detail);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupDetailLoading(false);
    }
  };

  const restoreBackup = async (fileName: string) => {
    const confirmed = window.confirm(t('admin.database.backupRestoreConfirm', { file: fileName }));
    if (!confirmed) return;
    setRestoringBackup(true);
    setBackupError('');
    try {
      const result = await api.restoreDatabaseBackup(accessToken, fileName, backupSource);
      setInfoMessage(t('admin.database.backupRestoreSuccess', { file: result.restoredFromFile }));
      await Promise.all([runQuery({ nextPage: 1 }), loadBackupList(), loadReferenceData()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.database.queryFailed');
      setBackupError(message);
      setQueryError(message);
    } finally {
      setRestoringBackup(false);
    }
  };

  const exportData = async (format: 'csv' | 'xlsx') => {
    if (!selectedCollection) return;
    setExporting(true);
    try {
      const result = await api.exportDatabase(accessToken, format, {
        collection: selectedCollection,
        filters: toPayloadFilters(filters),
        sortField: sortField || undefined,
        sortDirection
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      handleSessionError(err, t('admin.database.queryFailed'));
    } finally {
      setExporting(false);
    }
  };

  const onCollectionChange = async (nextCollection: string) => {
    setSelectedCollection(nextCollection);
    const emptyFilters: UiFilter[] = [];
    setFilters(emptyFilters);
    setSortField('');
    setSortDirection('DESC');
    setPage(1);
    setRows([]);
    setTotal(0);
    setQueryError('');
    setCollectionFields([]);
    if (nextCollection) {
      await Promise.all([loadCollectionFields(accessToken, nextCollection), loadReferenceData()]);
      await runQuery({
        collection: nextCollection,
        nextPage: 1,
        nextFilters: emptyFilters,
        nextSortField: '',
        nextSortDirection: 'DESC'
      });
    }
  };

  const editingFriendlyColumns = editingCollection
    ? buildFriendlyColumnsForCollection(editingCollection, editingRow ? Object.keys(editingRow.document || {}) : [])
    : [];

  const renderDependencySummary = (item: ResolveRowState) => {
    const row = dependencyRowsByKey[getDependencyRowId(item.dependency)];
    if (!row) {
      return (
        <div className="space-y-1 text-xs text-muted">
          <p>{item.dependency.documentTitle}</p>
          <p>{t('admin.database.loadingRows')}</p>
        </div>
      );
    }
    const columns = buildFriendlyColumnsForCollection(item.dependency.collection, Object.keys(row.document || {})).slice(0, 4);
    if (columns.length === 0) {
      return <p className="text-xs text-muted">{item.dependency.documentTitle}</p>;
    }
    return (
      <div className="space-y-1 text-xs">
        {columns.map(column => (
          <p key={`${item.key}-${column.id}`} className="whitespace-pre-wrap break-words">
            <span className="font-semibold">{column.label}:</span> {toSingleLine(column.getValue(row.document)) || '-'}
          </p>
        ))}
      </div>
    );
  };

  return (
    <>
      <TopNav />
      <RequireRole role="SUPERADMIN">
        <AdminShell title={t('admin.nav.database')}>
          {!isUnlocked ? (
            <Card className="max-w-xl">
              <form className="space-y-3" onSubmit={unlock}>
                <div>
                  <h3 className="text-lg font-semibold">{t('admin.database.lockTitle')}</h3>
                  <p className="text-sm text-muted">{t('admin.database.lockHint')}</p>
                </div>
                <Input
                  type="password"
                  value={unlockPassword}
                  onChange={event => setUnlockPassword(event.target.value)}
                  placeholder={t('admin.database.password')}
                />
                {unlockError ? <p className="text-sm text-red-600">{unlockError}</p> : null}
                <Button type="submit" disabled={unlocking || !unlockPassword.trim()}>
                  {unlocking ? t('admin.database.unlocking') : t('admin.database.unlock')}
                </Button>
              </form>
            </Card>
          ) : (
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <Card className="space-y-3 overflow-visible">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{t('admin.database.sessionExpires', { time: new Date(sessionExpiresAt).toLocaleString() })}</span>
                </div>
                {infoMessage ? <p className="text-sm text-green-700">{infoMessage}</p> : null}
                {collectionsLoading ? <p className="text-sm text-muted">{t('admin.database.loadingCollections')}</p> : null}
                <div className="grid gap-2 lg:grid-cols-[minmax(220px,340px)_minmax(0,1fr)]">
                  <Select value={selectedCollection} onChange={event => void onCollectionChange(event.target.value)}>
                    <option value="">{t('admin.database.selectCollection')}</option>
                    {collections.map(item => (
                      <option key={item.name} value={item.name}>
                        {collectionDisplayName(item.name, t)} ({item.count})
                      </option>
                    ))}
                  </Select>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button type="button" variant="outline" onClick={runManualBackup} disabled={backupRunning || !selectedCollection}>
                      {backupRunning ? t('admin.database.backupRunning') : t('admin.database.manualBackup')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openWipeModal('COLLECTION')}
                      disabled={!selectedCollection || wiping}
                    >
                      {t('admin.database.wipeCollection')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => openWipeModal('DATABASE')} disabled={wiping}>
                      {t('admin.database.wipeDatabase')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void openBackupDirectoryModal()}>
                      {t('admin.database.backupPath')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void openBackupList()} disabled={backupListLoading}>
                      {t('admin.database.backupList')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void exportData('csv')} disabled={exporting || !selectedCollection}>
                      {exporting ? t('admin.database.exporting') : t('admin.database.exportCsv')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void exportData('xlsx')} disabled={exporting || !selectedCollection}>
                      {exporting ? t('admin.database.exporting') : t('admin.database.exportXlsx')}
                    </Button>
                  </div>
                </div>
              </Card>

              {selectedCollection ? (
                <>
                  <Card>
                    <form className="space-y-3" onSubmit={applySearch}>
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <h3 className="font-semibold">{t('admin.database.filters')}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted">{t('admin.database.viewMode')}</span>
                          <Button
                            type="button"
                            variant={viewMode === 'friendly' ? 'default' : 'outline'}
                            className="h-8 px-3 text-xs"
                            onClick={() => void switchViewMode('friendly')}
                          >
                            {t('admin.database.viewFriendly')}
                          </Button>
                          <Button
                            type="button"
                            variant={viewMode === 'raw' ? 'default' : 'outline'}
                            className="h-8 px-3 text-xs"
                            onClick={() => void switchViewMode('raw')}
                          >
                            {t('admin.database.viewRaw')}
                          </Button>
                          <Button type="button" variant="outline" onClick={addFilter} disabled={fieldOptions.length === 0}>
                            {t('admin.database.addFilter')}
                          </Button>
                        </div>
                      </div>

                      {collectionFieldsLoading ? <p className="text-sm text-muted">{t('admin.database.loadingRows')}</p> : null}

                      {filters.length > 0 ? (
                        <div className="space-y-2">
                          {filters.map(filter => (
                            <div key={filter.key} className="grid gap-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]">
                              <Select value={filter.field} onChange={event => updateFilter(filter.key, { field: event.target.value })}>
                                <option value="">{t('admin.database.selectField')}</option>
                                {fieldOptions.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                value={filter.operator}
                                onChange={event => updateFilter(filter.key, { operator: event.target.value as DatabaseFilterOperator })}
                              >
                                {OPERATORS.map(operator => (
                                  <option key={operator} value={operator}>
                                    {t(`admin.database.operator.${operator}`)}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                value={filter.value}
                                onChange={event => updateFilter(filter.key, { value: event.target.value })}
                                placeholder={t('admin.database.filterValue')}
                              />
                              <Button type="button" variant="outline" onClick={() => removeFilter(filter.key)}>
                                {t('common.delete')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_180px_120px_auto_auto]">
                        <Select value={sortField} onChange={event => setSortField(event.target.value)}>
                          <option value="">{t('admin.database.sortDefault')}</option>
                          {fieldOptions.map(option => (
                            <option key={`sort-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <Select value={sortDirection} onChange={event => setSortDirection(event.target.value as 'ASC' | 'DESC')}>
                          <option value="DESC">{t('admin.database.sortDesc')}</option>
                          <option value="ASC">{t('admin.database.sortAsc')}</option>
                        </Select>
                        <Select
                          value={String(pageSize)}
                          onChange={event => {
                            const nextPageSize = Number(event.target.value) || 50;
                            setPageSize(nextPageSize);
                          }}
                        >
                          <option value="20">20</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                          <option value="200">200</option>
                        </Select>
                        <Button type="submit">{t('admin.database.search')}</Button>
                        <Button type="button" variant="outline" onClick={() => void resetFilters()}>
                          {t('admin.database.reset')}
                        </Button>
                      </div>
                    </form>
                  </Card>

                  <Card className="overflow-hidden">
                    {queryError ? <p className="mb-2 text-sm text-red-600">{queryError}</p> : null}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                      <span>{t('admin.database.totalRows', { count: total })}</span>
                      <span>{t('admin.database.page', { page, totalPages })}</span>
                    </div>

                    {loadingRows ? (
                      <p className="text-sm text-muted">{t('admin.database.loadingRows')}</p>
                    ) : rows.length === 0 ? (
                      <p className="text-sm text-muted">{t('admin.database.empty')}</p>
                    ) : (
                      <div className="max-h-[58vh] overflow-auto">
                        <Table className={viewMode === 'friendly' ? 'min-w-full' : 'w-max min-w-max'}>
                          <TableHeader className="sticky top-0 z-20 bg-white">
                            <TableRow>
                              {activeColumns.map(column => (
                                <TableHead key={column.id} className="bg-white">
                                  {column.label}
                                </TableHead>
                              ))}
                              <TableHead className="bg-white">{t('admin.database.actions')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map(row => (
                              <TableRow key={row.id}>
                                {activeColumns.map(column => (
                                  <TableCell key={`${row.id}-${column.id}`} className="align-top text-xs">
                                    <div className="max-w-[360px] whitespace-pre-wrap break-words">{column.getValue(row.document)}</div>
                                  </TableCell>
                                ))}
                                <TableCell className="align-top">
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => openEdit(row)}>
                                      {t('common.edit')}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-8 px-3 text-xs"
                                      disabled={dependencyLoading}
                                      onClick={() => void deleteRow(row)}
                                    >
                                      {t('common.delete')}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" variant="outline" disabled={!canPrev || loadingRows} onClick={() => void runQuery({ nextPage: page - 1 })}>
                        {t('admin.database.prev')}
                      </Button>
                      <Button type="button" variant="outline" disabled={!canNext || loadingRows} onClick={() => void runQuery({ nextPage: page + 1 })}>
                        {t('admin.database.next')}
                      </Button>
                    </div>
                  </Card>
                </>
              ) : (
                <Card>
                  <p className="text-sm text-muted">{t('admin.database.noCollectionSelected')}</p>
                </Card>
              )}
            </div>
          )}
        </AdminShell>
      </RequireRole>

      <Dialog
        open={editOpen}
        onOpenChange={nextOpen => {
          setEditOpen(nextOpen);
          if (!nextOpen) {
            setEditError('');
            setEditingRow(null);
            setEditingCollection('');
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {t('admin.database.editTitle')}
              {editingCollection ? ` • ${collectionDisplayName(editingCollection, t)}` : ''}
            </DialogTitle>
          </DialogHeader>
          {editingRow && editingFriendlyColumns.length > 0 ? (
            <div className="max-h-[36vh] overflow-auto rounded-xl border border-border">
              <Table className="min-w-full">
                <TableHeader className="sticky top-0 z-20 bg-white">
                  <TableRow>
                    <TableHead className="w-[220px] bg-white">{t('admin.database.dependencyField')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.dependencyCurrentValue')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editingFriendlyColumns.map(column => (
                    <TableRow key={`edit-friendly-${column.id}`}>
                      <TableCell className="align-top text-xs font-semibold">{column.label}</TableCell>
                      <TableCell className="align-top text-xs">
                        <div className="whitespace-pre-wrap break-words">{column.getValue(editingRow.document)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <textarea
            className="min-h-[360px] w-full rounded-xl border border-border p-3 font-mono text-xs outline-none focus:border-accent"
            value={editText}
            onChange={event => setEditText(event.target.value)}
          />
          {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.close')}
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dependencyWarningOpen}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            setDependencyWarningOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.dependencyWarningTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink">
            {t('admin.database.dependencyWarningBody', { count: dependencyReport?.dependencyCount ?? 0 })}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => closeDependencyModals()}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void openDependencyResolveModal()}>
              {t('admin.database.dependencyEdit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dependencyResolveOpen}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            setDependencyResolveOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.dependencyResolveTitle')}</DialogTitle>
          </DialogHeader>
          {dependencyReport ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                {t('admin.database.dependencyResolveHint', {
                  target: dependencyReport.targetDocumentTitle,
                  count: dependencyReport.dependencyCount
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={applyBulkRemove}>
                  {t('admin.database.dependencyBulkRemove')}
                </Button>
                <Select value={bulkReplacementDocumentId} onChange={event => setBulkReplacementDocumentId(event.target.value)}>
                  <option value="">{t('admin.database.dependencySelectReplacement')}</option>
                  {replacementCandidates.map(candidate => (
                    <option key={`bulk-replacement-${candidate.id}`} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  disabled={!bulkReplacementDocumentId}
                  onClick={applyBulkReplace}
                >
                  {t('admin.database.dependencyBulkReplace')}
                </Button>
              </div>
              {replacementLoading || dependencyRowsLoading ? <p className="text-xs text-muted">{t('admin.database.loadingRows')}</p> : null}
              <div className="max-h-[52vh] overflow-auto">
                <Table className="min-w-full">
                  <TableHeader className="sticky top-0 z-20 bg-white">
                    <TableRow>
                      <TableHead className="bg-white">{t('admin.database.collection')}</TableHead>
                      <TableHead className="bg-white">{t('admin.database.dependencyDocument')}</TableHead>
                      <TableHead className="bg-white">{t('admin.database.dependencyField')}</TableHead>
                      <TableHead className="bg-white">{t('admin.database.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolveRows.map(item => (
                      <TableRow key={item.key}>
                        <TableCell className="align-top text-xs">{collectionDisplayName(item.dependency.collection, t)}</TableCell>
                        <TableCell className="align-top">{renderDependencySummary(item)}</TableCell>
                        <TableCell className="align-top text-xs">
                          <div className="space-y-1">
                            <p>
                              <span className="font-semibold">{prettifyFieldName(normalizeDependencyFieldPath(item.dependency.fieldPath))}</span>
                            </p>
                            <p className="text-muted">{item.dependency.valuePreview || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant={item.mode === 'REMOVE' ? 'default' : 'outline'}
                                className="h-8 px-3 text-xs"
                                onClick={() => setResolveRowMode(item.key, 'REMOVE')}
                              >
                                {t('common.delete')}
                              </Button>
                              <Button
                                type="button"
                                variant={item.mode === 'REPLACE' ? 'default' : 'outline'}
                                className="h-8 px-3 text-xs"
                                onClick={() => setResolveRowMode(item.key, 'REPLACE')}
                              >
                                {t('common.edit')}
                              </Button>
                            </div>
                            {item.mode === 'REPLACE' ? (
                              <Select
                                value={item.replacementDocumentId}
                                onChange={event => setResolveRowReplacement(item.key, event.target.value)}
                              >
                                <option value="">{t('admin.database.dependencySelectReplacement')}</option>
                                {replacementCandidates.map(candidate => (
                                  <option key={`${item.key}-${candidate.id}`} value={candidate.id}>
                                    {candidate.label}
                                  </option>
                                ))}
                              </Select>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => closeDependencyModals()}>
                  {t('common.cancel')}
                </Button>
                <Button type="button" onClick={() => void applyDependencyResolution()} disabled={dependencySaving}>
                  {dependencySaving ? t('admin.database.resolving') : t('admin.database.dependencyApply')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('admin.database.empty')}</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={successPopupOpen} onOpenChange={setSuccessPopupOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.successTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink">{successPopupMessage || t('admin.database.queryFailed')}</p>
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setSuccessPopupOpen(false)}>
              {t('common.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={wipeModalOpen} onOpenChange={setWipeModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.wipeTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-red-600">
              {t('admin.database.wipeWarning', {
                scope: wipeScope === 'DATABASE' ? t('admin.database.wipeDatabaseLabel') : selectedCollection || ''
              })}
            </p>
            <p className="text-muted">{t('admin.database.wipeConfirmHelp', { text: wipeExpectedConfirmText })}</p>
            <Input value={wipeConfirmText} onChange={event => setWipeConfirmText(event.target.value)} placeholder={wipeExpectedConfirmText} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWipeModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              disabled={wiping || !wipeConfirmText.trim() || wipeConfirmText.trim().toUpperCase() !== wipeExpectedConfirmText.toUpperCase()}
              onClick={() => void executeWipe()}
            >
              {wiping ? t('admin.database.wiping') : t('admin.database.wipeConfirmButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={wipeRollbackOpen} onOpenChange={setWipeRollbackOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.wipeRollbackTitle')}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{wipeRollbackMessage || t('admin.database.queryFailed')}</p>
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setWipeRollbackOpen(false)}>
              {t('common.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backupDirectoryOpen} onOpenChange={setBackupDirectoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.backupPathTitle')}</DialogTitle>
          </DialogHeader>
          {backupDirectoryLoading ? (
            <p className="text-sm text-muted">{t('admin.database.loadingRows')}</p>
          ) : (
            <div className="space-y-3">
              <p className="rounded-lg border border-border bg-[#f8f1e8] p-3 font-mono text-xs">
                {backupDirectoryPath || t('admin.database.queryFailed')}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void copyBackupDirectoryPath()} disabled={!backupDirectoryPath}>
                  {t('admin.database.backupPathCopy')}
                </Button>
                <Button type="button" variant="outline" onClick={() => void openBackupFolderOnHost()} disabled={backupDirectoryOpening}>
                  {backupDirectoryOpening ? t('admin.database.backupPathOpening') : t('admin.database.backupPathOpen')}
                </Button>
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setBackupDirectoryOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteBackupOpen} onOpenChange={setDeleteBackupOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.backupDeleteTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-red-600">{t('admin.database.backupDeleteWarning', { file: deleteBackupFileName || '-' })}</p>
            <p className="text-muted">{t('admin.database.backupDeleteConfirmHint', { text: backupDeleteExpectedConfirm })}</p>
            <Input value={deleteBackupConfirmText} onChange={event => setDeleteBackupConfirmText(event.target.value)} placeholder={backupDeleteExpectedConfirm} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteBackupOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              disabled={
                deletingBackup ||
                !deleteBackupFileName ||
                deleteBackupConfirmText.trim().toUpperCase() !== backupDeleteExpectedConfirm.toUpperCase()
              }
              onClick={() => void deleteBackupFile()}
            >
              {deletingBackup ? t('admin.database.backupDeleting') : t('admin.database.backupDeleteButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backupListOpen} onOpenChange={setBackupListOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.backupListTitle')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{t('admin.database.backupSource')}:</span>
            <Select
              value={backupSource}
              onChange={event => {
                const nextSource = event.target.value as DatabaseBackupSource;
                setBackupSource(nextSource);
                setBackupDetail(null);
                setBackupDetailOpen(false);
                void loadBackupList(nextSource);
              }}
            >
              <option value="LOCAL">{t('admin.database.backupSourceLocal')}</option>
              <option value="DRIVE">{t('admin.database.backupSourceDrive')}</option>
            </Select>
          </div>
          {backupError ? <p className="text-sm text-red-600">{backupError}</p> : null}
          {backupListLoading ? (
            <p className="text-sm text-muted">{t('admin.database.backupListLoading')}</p>
          ) : backupList.length === 0 ? (
            <p className="text-sm text-muted">{t('admin.database.backupListEmpty')}</p>
          ) : (
            <div className="max-h-[52vh] overflow-auto">
              <Table className="min-w-full">
                <TableHeader className="sticky top-0 z-20 bg-white">
                  <TableRow>
                    <TableHead className="bg-white">{t('admin.database.backupFile')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.backupSource')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.backupReason')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.backupCreatedAt')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.backupSize')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backupList.map(item => (
                    <TableRow key={`${item.source}-${item.fileName}`}>
                      <TableCell className="text-xs">{item.fileName}</TableCell>
                      <TableCell>{item.source === 'DRIVE' ? t('admin.database.backupSourceDrive') : t('admin.database.backupSourceLocal')}</TableCell>
                      <TableCell>{item.trigger || '-'}</TableCell>
                      <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{formatFileSize(item.sizeBytes)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => void openBackupDetail(item.fileName)}>
                            {t('admin.database.backupViewDetail')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            disabled={restoringBackup}
                            onClick={() => void restoreBackup(item.fileName)}
                          >
                            {restoringBackup ? t('admin.database.backupRestoreRunning') : t('admin.database.backupRestore')}
                          </Button>
                          {backupSource === 'LOCAL' ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 px-3 text-xs"
                              onClick={() => requestDeleteBackup(item.fileName)}
                            >
                              {t('common.delete')}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setBackupListOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backupDetailOpen} onOpenChange={setBackupDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.backupDetailTitle')}</DialogTitle>
          </DialogHeader>
          {backupDetailLoading ? (
            <p className="text-sm text-muted">{t('admin.database.backupDetailLoading')}</p>
          ) : backupDetail ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <strong>{t('admin.database.backupFile')}:</strong> {backupDetail.fileName}
                </p>
                <p>
                  <strong>{t('admin.database.backupCreatedAt')}:</strong> {new Date(backupDetail.createdAt).toLocaleString()}
                </p>
                <p>
                  <strong>{t('admin.database.backupSource')}:</strong>{' '}
                  {backupDetail.source === 'DRIVE' ? t('admin.database.backupSourceDrive') : t('admin.database.backupSourceLocal')}
                </p>
                <p>
                  <strong>{t('admin.database.backupTrigger')}:</strong> {backupDetail.trigger}
                </p>
                <p>
                  <strong>{t('admin.database.backupActor')}:</strong> {backupDetail.actorEmail || 'system'}
                </p>
                <p>
                  <strong>{t('admin.database.backupDatabase')}:</strong> {backupDetail.database}
                </p>
                <p>
                  <strong>{t('admin.database.backupDocuments')}:</strong> {backupDetail.totalDocuments}
                </p>
              </div>
              <div>
                <p className="mb-2 font-semibold">{t('admin.database.backupCollections')}</p>
                {backupDetail.collections.length === 0 ? (
                  <p className="text-sm text-muted">
                    {backupDetail.source === 'DRIVE' ? t('admin.database.backupDetailDriveNoCollectionPreview') : t('admin.database.empty')}
                  </p>
                ) : (
                  <div className="max-h-[40vh] overflow-auto">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-20 bg-white">
                        <TableRow>
                          <TableHead className="bg-white">{t('admin.database.collection')}</TableHead>
                          <TableHead className="bg-white">{t('admin.database.backupDocuments')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backupDetail.collections.map(collection => (
                          <TableRow key={collection.name}>
                            <TableCell>{collection.name}</TableCell>
                            <TableCell>{collection.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('admin.database.empty')}</p>
          )}
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setBackupDetailOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
