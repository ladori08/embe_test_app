'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Ingredient, IngredientTransaction, StockLotAllocation } from '@/lib/types';
import { buildHeaderIndex, downloadTextFile, findColumnIndex, parseFlexibleNumber, parsePastedRows } from '@/lib/bulk';

type UnitDisplayMode = 'small' | 'large';

const emptyForm = { name: '', unit: 'g', currentStock: 0, reorderLevel: 0, costTrackingMethod: 'AVG_BIN' };

const getInputUnitOptions = (baseUnit?: string | null) => {
  if (baseUnit === 'g') return ['g', 'kg'];
  if (baseUnit === 'ml') return ['ml', 'l'];
  return ['pcs'];
};

const convertQty = (value: number, unit: string | null | undefined, mode: UnitDisplayMode) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (mode === 'large' && (unit === 'g' || unit === 'ml')) {
    return value / 1000;
  }
  return value;
};

const convertUnit = (unit: string | null | undefined, mode: UnitDisplayMode) => {
  if (!unit) {
    return '';
  }
  if (mode === 'large') {
    if (unit === 'g') return 'kg';
    if (unit === 'ml') return 'l';
  }
  return unit;
};

const formatQty = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number(value.toFixed(4)).toLocaleString('vi-VN');
};

export default function AdminIngredientsPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockTarget, setRestockTarget] = useState<Ingredient | null>(null);
  const [restockQty, setRestockQty] = useState('0');
  const [restockUnit, setRestockUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g');
  const [restockCost, setRestockCost] = useState('');
  const [restockNote, setRestockNote] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');

  const [transactions, setTransactions] = useState<IngredientTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');
  const [txType, setTxType] = useState<'IN' | 'OUT' | ''>('');
  const [txQuery, setTxQuery] = useState('');
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');

  const [unitDisplayMode, setUnitDisplayMode] = useState<UnitDisplayMode>('small');

  const { t } = useI18n();

  const unitOptions = useMemo(() => getInputUnitOptions(restockTarget?.unit), [restockTarget]);

  const loadIngredients = async () => {
    setLoading(true);
    try {
      const list = await api.listIngredients();
      setItems(list);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ingredients');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (filters?: {
    type?: 'IN' | 'OUT' | '';
    query?: string;
    from?: string;
    to?: string;
  }) => {
    setTxLoading(true);
    try {
      const typeFilter = filters?.type ?? txType;
      const queryFilter = filters?.query ?? txQuery;
      const fromFilter = filters?.from ?? txFrom;
      const toFilter = filters?.to ?? txTo;
      const fromIso = fromFilter ? new Date(`${fromFilter}T00:00:00`).toISOString() : undefined;
      const toIso = toFilter ? new Date(`${toFilter}T23:59:59`).toISOString() : undefined;
      const list = await api.listIngredientTransactions({
        type: typeFilter || undefined,
        q: queryFilter.trim() || undefined,
        from: fromIso,
        to: toIso,
        limit: 500
      });
      setTransactions(list);
      setTxError('');
    } catch (err) {
      setTxError(err instanceof Error ? err.message : t('admin.ingredients.txLoadFailed'));
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadIngredients(), loadTransactions()]);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item: Ingredient) => {
    setEditing(item);
    setForm(item);
    setOpen(true);
  };

  const openRestock = (item: Ingredient) => {
    setRestockTarget(item);
    setRestockQty('0');
    const options = getInputUnitOptions(item.unit);
    setRestockUnit((options[0] || 'g') as 'g' | 'kg' | 'ml' | 'l' | 'pcs');
    setRestockCost('');
    setRestockNote('');
    setRestockOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      currentStock: Number(form.currentStock),
      reorderLevel: Number(form.reorderLevel)
    };
    if (editing) {
      await api.updateIngredient(editing.id, payload);
    } else {
      await api.createIngredient(payload);
    }
    setOpen(false);
    await loadAll();
  };

  const submitRestock = async (e: FormEvent) => {
    e.preventDefault();
    if (!restockTarget) {
      return;
    }

    const qty = parseFlexibleNumber(restockQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t('admin.ingredients.restockInvalidQty'));
      return;
    }

    const unitCost = restockCost.trim() ? parseFlexibleNumber(restockCost) : undefined;
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setError(t('admin.ingredients.invalidUnitCost'));
      return;
    }

    await api.adjustIngredientStock(restockTarget.id, {
      type: 'IN',
      qty,
      inputUnit: restockUnit,
      unitCost,
      note: restockNote.trim() || 'Restock'
    });
    setRestockOpen(false);
    await loadAll();
  };

  const remove = async (id: string) => {
    await api.deleteIngredient(id);
    await loadAll();
  };

  const applyTransactionFilter = async (e: FormEvent) => {
    e.preventDefault();
    await loadTransactions();
  };

  const clearTransactionFilter = async () => {
    setTxType('');
    setTxQuery('');
    setTxFrom('');
    setTxTo('');
    await loadTransactions({ type: '', query: '', from: '', to: '' });
  };

  const downloadTemplate = () => {
    const template = ['name,unit,currentStock,reorderLevel,costTrackingMethod', 'Flour,g,5,1,AVG_BIN', 'Sugar,g,2,0.5,AVG_BIN'].join('\n');
    downloadTextFile('ingredients-import-template.csv', template);
  };

  const importBulk = async () => {
    setImporting(true);
    try {
      const rows = parsePastedRows(importText);
      if (rows.length === 0) {
        throw new Error(t('admin.ingredients.bulkImportEmpty'));
      }

      const headerIndex = buildHeaderIndex(rows[0]);
      const detectedName = findColumnIndex(headerIndex, ['name', 'ten']);
      const detectedUnit = findColumnIndex(headerIndex, ['unit', 'dvt', 'donvi', 'donvitinh']);
      const detectedStock = findColumnIndex(headerIndex, ['currentStock', 'stock', 'qty', 'sl', 'soluong']);
      const detectedReorder = findColumnIndex(headerIndex, ['reorderLevel', 'reorder', 'nguongnhaplai', 'threshold']);
      const detectedMethod = findColumnIndex(headerIndex, ['costTrackingMethod', 'costtracking', 'method']);

      const hasHeader = detectedName >= 0 || detectedUnit >= 0 || detectedStock >= 0;
      const dataRows = hasHeader ? rows.slice(1) : rows;

      const nameIndex = hasHeader ? detectedName : 0;
      const unitIndex = hasHeader ? detectedUnit : 1;
      const stockIndex = hasHeader ? detectedStock : 2;
      const reorderIndex = hasHeader ? detectedReorder : 3;
      const methodIndex = hasHeader ? detectedMethod : 4;

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const lineNo = hasHeader ? i + 2 : i + 1;
        if (!row || row.every(cell => !cell.trim())) {
          continue;
        }

        const name = nameIndex >= 0 ? (row[nameIndex] || '').trim() : '';
        const unitRaw = unitIndex >= 0 ? (row[unitIndex] || '').trim().toLowerCase() : '';
        const stockRaw = stockIndex >= 0 ? (row[stockIndex] || '').trim() : '';
        const reorderRaw = reorderIndex >= 0 ? (row[reorderIndex] || '').trim() : '';
        const method = methodIndex >= 0 ? (row[methodIndex] || '').trim() : '';

        if (!name || !unitRaw || !stockRaw) {
          skipped++;
          errors.push(`Line ${lineNo}: missing required data`);
          continue;
        }

        if (!['g', 'ml', 'pcs'].includes(unitRaw)) {
          skipped++;
          errors.push(`Line ${lineNo}: invalid unit "${unitRaw}"`);
          continue;
        }

        const currentStock = parseFlexibleNumber(stockRaw);
        const reorderLevel = reorderRaw ? parseFlexibleNumber(reorderRaw) : 0;
        if (!Number.isFinite(currentStock) || currentStock < 0 || !Number.isFinite(reorderLevel) || reorderLevel < 0) {
          skipped++;
          errors.push(`Line ${lineNo}: invalid numeric value`);
          continue;
        }

        try {
          await api.createIngredient({
            name,
            unit: unitRaw as 'g' | 'ml' | 'pcs',
            currentStock,
            reorderLevel,
            costTrackingMethod: method || 'AVG_BIN'
          });
          imported++;
        } catch (err) {
          skipped++;
          const message = err instanceof Error ? err.message : 'Failed';
          errors.push(`Line ${lineNo}: ${message}`);
        }
      }

      const previewErrors = errors.slice(0, 5).join(' | ');
      setImportResult(
        `${t('admin.ingredients.bulkImportResult')}: imported=${imported}, skipped=${skipped}${previewErrors ? ` (${previewErrors})` : ''}`
      );
      await loadAll();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t('admin.ingredients.bulkImportFailed'));
    } finally {
      setImporting(false);
    }
  };

  const formatAllocation = (allocations: StockLotAllocation[] | undefined, unit: string | null | undefined) => {
    if (!allocations || allocations.length === 0) {
      return '-';
    }

    return allocations
      .map(allocation => {
        const qty = convertQty(Number(allocation.qty || 0), unit, unitDisplayMode);
        const qtyText = formatQty(qty);
        return `${allocation.lotCode} (${qtyText} ${convertUnit(unit, unitDisplayMode)})`;
      })
      .join(', ');
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.ingredients')}>
          <Card>
            <div className="mb-3 flex flex-wrap justify-between gap-2">
              <p className="text-sm text-muted">{t('admin.ingredients.help')}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  {t('admin.ingredients.bulkImport')}
                </Button>
                <Button onClick={openCreate}>{t('admin.ingredients.add')}</Button>
              </div>
            </div>
            {loading ? (
              <p className="text-sm text-muted">{t('admin.ingredients.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.ingredients.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.ingredients.name')}</TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <p>{t('admin.ingredients.unit')}</p>
                        <Select value={unitDisplayMode} onChange={e => setUnitDisplayMode(e.target.value as UnitDisplayMode)}>
                          <option value="small">{t('admin.ingredients.unitSmall')}</option>
                          <option value="large">{t('admin.ingredients.unitLarge')}</option>
                        </Select>
                      </div>
                    </TableHead>
                    <TableHead>{t('admin.ingredients.stock')}</TableHead>
                    <TableHead>{t('admin.ingredients.reorder')}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{convertUnit(item.unit, unitDisplayMode)}</TableCell>
                      <TableCell>{formatQty(convertQty(Number(item.currentStock || 0), item.unit, unitDisplayMode))}</TableCell>
                      <TableCell>{formatQty(convertQty(Number(item.reorderLevel || 0), item.unit, unitDisplayMode))}</TableCell>
                      <TableCell className="text-right">
                        <button className="mr-3 text-sm underline" onClick={() => openRestock(item)}>
                          {t('admin.ingredients.restock')}
                        </button>
                        <button className="mr-3 text-sm underline" onClick={() => openEdit(item)}>
                          {t('common.edit')}
                        </button>
                        <button className="text-sm text-red-600 underline" onClick={() => remove(item.id)}>
                          {t('common.delete')}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="mt-4">
            <div className="mb-3">
              <h3 className="text-base font-semibold">{t('admin.ingredients.txTitle')}</h3>
              <p className="text-sm text-muted">{t('admin.ingredients.txHelp')}</p>
            </div>
            <form className="mb-3 grid gap-2 md:grid-cols-[170px_1fr_180px_180px_120px_120px]" onSubmit={applyTransactionFilter}>
              <Select value={txType} onChange={e => setTxType(e.target.value as 'IN' | 'OUT' | '')}>
                <option value="">{t('admin.ingredients.txAllActions')}</option>
                <option value="IN">{t('admin.ingredients.txIn')}</option>
                <option value="OUT">{t('admin.ingredients.txOut')}</option>
              </Select>
              <Input value={txQuery} onChange={e => setTxQuery(e.target.value)} placeholder={t('admin.ingredients.txSearchPlaceholder')} />
              <Input type="date" value={txFrom} onChange={e => setTxFrom(e.target.value)} />
              <Input type="date" value={txTo} onChange={e => setTxTo(e.target.value)} />
              <Button type="submit">{t('admin.ingredients.txApply')}</Button>
              <Button type="button" variant="outline" onClick={clearTransactionFilter}>
                {t('admin.ingredients.txReset')}
              </Button>
            </form>

            {txLoading ? (
              <p className="text-sm text-muted">{t('admin.ingredients.txLoading')}</p>
            ) : txError ? (
              <p className="text-sm text-red-600">{txError}</p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.ingredients.txEmpty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.ingredients.txTime')}</TableHead>
                    <TableHead>{t('admin.ingredients.name')}</TableHead>
                    <TableHead>{t('admin.ingredients.txAction')}</TableHead>
                    <TableHead>{t('admin.ingredients.txQty')}</TableHead>
                    <TableHead>{t('admin.ingredients.unit')}</TableHead>
                    <TableHead>{t('admin.ingredients.txLot')}</TableHead>
                    <TableHead>{t('admin.ingredients.txRemaining')}</TableHead>
                    <TableHead>{t('admin.ingredients.restockNote')}</TableHead>
                    <TableHead>{t('admin.ingredients.txBy')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell>{new Date(tx.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{tx.ingredientName}</TableCell>
                      <TableCell>{tx.type}</TableCell>
                      <TableCell>{formatQty(convertQty(Number(tx.qty || 0), tx.ingredientUnit, unitDisplayMode))}</TableCell>
                      <TableCell>{convertUnit(tx.ingredientUnit, unitDisplayMode)}</TableCell>
                      <TableCell>
                        {tx.type === 'IN' ? tx.lotCode || '-' : formatAllocation(tx.allocations, tx.ingredientUnit)}
                      </TableCell>
                      <TableCell>{tx.remainingQty == null ? '-' : formatQty(convertQty(Number(tx.remainingQty), tx.ingredientUnit, unitDisplayMode))}</TableCell>
                      <TableCell>{tx.note || '-'}</TableCell>
                      <TableCell>{tx.createdBy || 'system'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? t('admin.ingredients.edit') : t('admin.ingredients.create')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <FormField label={t('admin.ingredients.name')}>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.ingredients.unit')}>
                  <Select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                  </Select>
                </FormField>
                <FormField label={t('admin.ingredients.currentStock')}>
                  <Input type="number" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.ingredients.reorderLevel')}>
                  <Input type="number" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.ingredients.costTracking')}>
                  <Input value={form.costTrackingMethod} onChange={e => setForm({ ...form, costTrackingMethod: e.target.value })} />
                </FormField>
                <Button className="w-full">{t('common.save')}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.ingredients.restockTitle')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submitRestock} className="space-y-3">
                <FormField label={t('admin.ingredients.name')}>
                  <Input value={restockTarget?.name || ''} readOnly />
                </FormField>
                <FormField label={t('admin.ingredients.restockQty')}>
                  <Input type="number" min="0" step="0.0001" value={restockQty} onChange={e => setRestockQty(e.target.value)} required />
                </FormField>
                <FormField label={t('admin.ingredients.restockUnit')}>
                  <Select value={restockUnit} onChange={e => setRestockUnit(e.target.value as 'g' | 'kg' | 'ml' | 'l' | 'pcs')}>
                    {unitOptions.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t('admin.ingredients.unitCost')}>
                  <Input type="number" min="0" step="0.0001" value={restockCost} onChange={e => setRestockCost(e.target.value)} />
                </FormField>
                <FormField label={t('admin.ingredients.restockNote')}>
                  <Input value={restockNote} onChange={e => setRestockNote(e.target.value)} />
                </FormField>
                <Button className="w-full">{t('common.save')}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('admin.ingredients.bulkImportTitle')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted">{t('admin.ingredients.bulkImportHint')}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={downloadTemplate}>
                    {t('admin.ingredients.bulkImportTemplate')}
                  </Button>
                </div>
                <FormField label={t('admin.ingredients.bulkImportInput')}>
                  <textarea
                    className="min-h-56 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                  />
                </FormField>
                {importResult ? <p className="text-sm text-muted">{importResult}</p> : null}
                <Button type="button" onClick={importBulk} disabled={importing}>
                  {importing ? t('admin.ingredients.bulkImportRunning') : t('admin.ingredients.bulkImportRun')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
