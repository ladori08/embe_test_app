'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiUrl } from '@/lib/api';
import { Product } from '@/lib/types';

const STOCK_POLL_INTERVAL_MS = 15000;

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  maxQty: number;
}

export interface AddItemResult {
  ok: boolean;
  available: number;
}

interface CartContextValue {
  items: CartItem[];
  stockByProductId: Record<string, number>;
  addItem: (product: Product, qty?: number) => AddItemResult;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  clear: () => void;
  refreshStockSnapshot: () => Promise<void>;
  subtotal: number;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [stockByProductId, setStockByProductId] = useState<Record<string, number>>({});
  const itemsRef = useRef<CartItem[]>([]);
  const stockByProductIdRef = useRef<Record<string, number>>({});

  const normalizeInt = (value: number, fallback = 0) => {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(0, Math.floor(value));
  };

  const commitItems = (nextItems: CartItem[]) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  };

  const applyStockMap = (nextStockByProductId: Record<string, number>) => {
    stockByProductIdRef.current = nextStockByProductId;
    setStockByProductId(nextStockByProductId);

    const nextItems = itemsRef.current.map(item => {
      const mappedStock = nextStockByProductId[item.productId];
      if (!Number.isFinite(mappedStock)) {
        return item;
      }
      return {
        ...item,
        maxQty: normalizeInt(mappedStock, item.maxQty)
      };
    });
    commitItems(nextItems);
  };

  const mergeStock = (productId: string, currentStock: number) => {
    const next = {
      ...stockByProductIdRef.current,
      [productId]: normalizeInt(currentStock)
    };
    applyStockMap(next);
  };

  const refreshStockSnapshot = async () => {
    try {
      const products = await api.listPublicProducts();
      const next = products.reduce<Record<string, number>>((acc, product) => {
        acc[product.id] = normalizeInt(Number(product.currentStock || 0));
        return acc;
      }, {});
      applyStockMap(next);
    } catch {
      // Best-effort sync: keep current view if snapshot fetch fails.
    }
  };

  useEffect(() => {
    const raw = window.localStorage.getItem('embe-cart');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Array<Partial<CartItem>>;
        const normalized = parsed
          .map(item => {
            const qty = normalizeInt(Number(item.qty ?? 0));
            if (qty <= 0 || !item.productId) {
              return null;
            }
            const persistedMax = normalizeInt(Number(item.maxQty ?? qty), qty);
            return {
              productId: String(item.productId),
              name: String(item.name || ''),
              price: Number(item.price || 0),
              qty,
              maxQty: Math.max(qty, persistedMax)
            } satisfies CartItem;
          })
          .filter((item): item is CartItem => item !== null);
        commitItems(normalized);
      } catch {
        commitItems([]);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('embe-cart', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    refreshStockSnapshot();

    const source = new EventSource(`${getApiUrl()}/api/products/public/stock-events`);
    source.addEventListener('stock_changed', event => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { productId: string; currentStock: number };
        if (!payload.productId) {
          return;
        }
        mergeStock(payload.productId, payload.currentStock);
      } catch {
        // ignore malformed event payload
      }
    });

    const pollId = window.setInterval(() => {
      refreshStockSnapshot();
    }, STOCK_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
      source.close();
    };
  }, []);

  const addItem = (product: Product, qty = 1): AddItemResult => {
    const requestedQty = normalizeInt(qty, 1);
    if (requestedQty <= 0) {
      return { ok: false, available: 0 };
    }

    const syncedStock = stockByProductIdRef.current[product.id];
    const maxQty = normalizeInt(Number.isFinite(syncedStock) ? syncedStock : Number(product.currentStock || 0));
    if (maxQty <= 0) {
      return { ok: false, available: 0 };
    }

    const currentItems = itemsRef.current;
    const existing = currentItems.find(item => item.productId === product.id);
    const inCartQty = existing ? existing.qty : 0;
    const available = Math.max(0, maxQty - inCartQty);
    if (requestedQty > available) {
      return { ok: false, available };
    }

    const nextItems = existing
      ? currentItems.map(item =>
          item.productId === product.id
            ? {
                ...item,
                name: product.name,
                price: product.price,
                qty: item.qty + requestedQty,
                maxQty
              }
            : item
        )
      : [...currentItems, { productId: product.id, name: product.name, price: product.price, qty: requestedQty, maxQty }];

    commitItems(nextItems);
    return { ok: true, available: Math.max(0, available - requestedQty) };
  };

  const removeItem = (productId: string) => {
    commitItems(itemsRef.current.filter(item => item.productId !== productId));
  };

  const updateQty = (productId: string, qty: number) => {
    const nextItems = itemsRef.current
      .map(item => {
        if (item.productId !== productId) {
          return item;
        }
        const nextQty = Math.min(Math.max(0, qty), Math.max(0, item.maxQty));
        return { ...item, qty: nextQty };
      })
      .filter(item => item.qty > 0);
    commitItems(nextItems);
  };

  const clear = () => commitItems([]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.qty, 0),
    [items]
  );
  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.qty, 0),
    [items]
  );

  return (
    <CartContext.Provider value={{ items, stockByProductId, addItem, removeItem, updateQty, clear, refreshStockSnapshot, subtotal, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return ctx;
}
