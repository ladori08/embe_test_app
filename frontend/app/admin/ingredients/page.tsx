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
import { buildHeaderIndex, findColumnIndex, parseFlexibleNumber, parsePastedRows } from '@/lib/bulk';

type UnitDisplayMode = 'small' | 'large';
type IngredientImportPayload = {
  name: string;
  ingredientCode: string;
  unit: 'g' | 'ml' | 'pcs';
  currentStock: number;
  totalCost: number | null;
  reorderLevel: number;
};

type IngredientImportAnalysis = {
  rows: IngredientImportPayload[];
  errors: string[];
  totalRows: number;
};

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

const formatCost = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number(value.toFixed(2)).toLocaleString('vi-VN');
};

const normalizeIngredientCode = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === '-' || /^0([.,]0+)?$/.test(normalized)) {
    return '';
  }
  return normalized;
};
const normalizeIngredientKey = (name: string, unit: string) => `${name.trim().toLowerCase()}::${unit.trim().toLowerCase()}`;

export default function AdminIngredientsPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Ingredient | null>(null);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockTarget, setRestockTarget] = useState<Ingredient | null>(null);
  const [restockQty, setRestockQty] = useState('0');
  const [restockUnit, setRestockUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g');
  const [restockTotalCost, setRestockTotalCost] = useState('');
  const [restockNote, setRestockNote] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [importPreview, setImportPreview] = useState<IngredientImportAnalysis | null>(null);
  const [importWorkbookName, setImportWorkbookName] = useState('');

  const [transactions, setTransactions] = useState<IngredientTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');
  const [txType, setTxType] = useState<'IN' | 'OUT' | ''>('');
  const [txQuery, setTxQuery] = useState('');
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [expandedLots, setExpandedLots] = useState<Record<string, boolean>>({});
  const [lotsByIngredient, setLotsByIngredient] = useState<Record<string, IngredientTransaction[]>>({});
  const [lotLoading, setLotLoading] = useState<Record<string, boolean>>({});
  const [lotError, setLotError] = useState<Record<string, string>>({});

  const [unitDisplayMode, setUnitDisplayMode] = useState<UnitDisplayMode>('small');

  const { t } = useI18n();

  const unitOptions = useMemo(() => getInputUnitOptions(restockTarget?.unit), [restockTarget]);
  const rawPreviewRows = useMemo(() => {
    try {
      return parsePastedRows(importText);
    } catch {
      return [];
    }
  }, [importText]);

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
    if (editing) {
      setForm(emptyForm);
    }
    setEditing(null);
    setOpen(true);
  };

  const openDetail = (item: Ingredient) => {
    setDetailTarget(item);
    setDetailOpen(true);
  };

  const closeDetailModal = (nextOpen: boolean) => {
    setDetailOpen(nextOpen);
    if (!nextOpen) {
      setDetailTarget(null);
    }
  };

  const openEdit = (item: Ingredient) => {
    if (editing?.id !== item.id) {
      setForm(item);
    }
    setEditing(item);
    setOpen(true);
  };

  const closeIngredientModal = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const cancelIngredientModal = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(false);
  };

  const openRestock = (item: Ingredient) => {
    if (restockTarget?.id !== item.id) {
      setRestockTarget(item);
      setRestockQty('0');
      const options = getInputUnitOptions(item.unit);
      setRestockUnit((options[0] || 'g') as 'g' | 'kg' | 'ml' | 'l' | 'pcs');
      setRestockTotalCost('');
      setRestockNote('');
    }
    setRestockOpen(true);
  };

  const closeRestockModal = (nextOpen: boolean) => {
    setRestockOpen(nextOpen);
  };

  const cancelRestockModal = () => {
    setRestockTarget(null);
    setRestockQty('0');
    setRestockUnit('g');
    setRestockTotalCost('');
    setRestockNote('');
    setRestockOpen(false);
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

    const totalCost = restockTotalCost.trim() ? parseFlexibleNumber(restockTotalCost) : undefined;
    if (totalCost == null || !Number.isFinite(totalCost) || totalCost <= 0) {
      setError(t('admin.ingredients.requiredTotalCost'));
      return;
    }

    await api.adjustIngredientStock(restockTarget.id, {
      type: 'IN',
      qty,
      inputUnit: restockUnit,
      totalCost,
      note: restockNote.trim() || 'Restock'
    });
    setRestockOpen(false);
    await loadAll();
  };

  const remove = async (id: string) => {
    await api.deleteIngredient(id);
    await loadAll();
  };

  const openBulkImportModal = () => {
    setImportOpen(true);
  };

  const closeImportModal = (nextOpen: boolean) => {
    setImportOpen(nextOpen);
  };

  const resetBulkImportDraft = () => {
    setImportText('');
    setImportResult('');
    setImportPreview(null);
    setImportWorkbookName('');
  };

  const cancelImportModal = () => {
    resetBulkImportDraft();
    setImportOpen(false);
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

  const loadLotsForIngredient = async (ingredientId: string) => {
    setLotLoading(prev => ({ ...prev, [ingredientId]: true }));
    setLotError(prev => ({ ...prev, [ingredientId]: '' }));
    try {
      const rows = await api.listIngredientTransactions({
        ingredientId,
        type: 'IN',
        limit: 500
      });
      const normalized = rows
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setLotsByIngredient(prev => ({ ...prev, [ingredientId]: normalized }));
    } catch (err) {
      setLotError(prev => ({
        ...prev,
        [ingredientId]: err instanceof Error ? err.message : t('admin.ingredients.txLoadFailed')
      }));
      setLotsByIngredient(prev => ({ ...prev, [ingredientId]: [] }));
    } finally {
      setLotLoading(prev => ({ ...prev, [ingredientId]: false }));
    }
  };

  const toggleLots = (ingredientId: string) => {
    const nextOpen = !expandedLots[ingredientId];
    setExpandedLots(prev => ({ ...prev, [ingredientId]: nextOpen }));
    if (nextOpen) {
      void loadLotsForIngredient(ingredientId);
    }
  };

  const downloadTemplate = async () => {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.calcProperties.fullCalcOnLoad = true;
    const importSheet = workbook.addWorksheet('Import');
    const ingredientsSheet = workbook.addWorksheet('Ingredients');
    const ingredients = [...items].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    ingredientsSheet.columns = [
      { header: 'ingredientCode', key: 'ingredientCode', width: 18 },
      { header: 'name', key: 'name', width: 32 }
    ];
    ingredients.forEach(ingredient => {
      ingredientsSheet.addRow({
        ingredientCode: ingredient.ingredientCode || '',
        name: ingredient.name
      });
    });
    ingredientsSheet.views = [{ state: 'frozen', ySplit: 1 }];

    importSheet.columns = [
      { header: 'ingredientCode', key: 'ingredientCode', width: 18 },
      { header: 'name', key: 'name', width: 32 },
      { header: 'unit', key: 'unit', width: 12 },
      { header: 'currentStock', key: 'currentStock', width: 14 },
      { header: 'totalCost', key: 'totalCost', width: 14 },
      { header: 'reorderLevel', key: 'reorderLevel', width: 14 }
    ];
    importSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const header = importSheet.getRow(1);
    header.font = { bold: true };

    const maxDataRow = 501;
    const ingredientsLastRow = Math.max(2, ingredients.length + 1);
    for (let rowNumber = 2; rowNumber <= maxDataRow; rowNumber++) {
      const codeCell = importSheet.getCell(`A${rowNumber}`);
      codeCell.value = {
        formula: `IF(B${rowNumber}="","",IFERROR(XLOOKUP(B${rowNumber},Ingredients!$B:$B,Ingredients!$A:$A,""),IFERROR(INDEX(Ingredients!$A:$A,MATCH(B${rowNumber},Ingredients!$B:$B,0)),"")))`,
        result: ''
      };
      codeCell.protection = { locked: false };
      if (ingredients.length > 0) {
        const nameCell = importSheet.getCell(`B${rowNumber}`);
        nameCell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Ingredients!$B$2:$B$${ingredientsLastRow}`],
          showErrorMessage: false
        };
        nameCell.protection = { locked: false };
      }
      importSheet.getCell(`C${rowNumber}`).protection = { locked: false };
      importSheet.getCell(`D${rowNumber}`).protection = { locked: false };
      importSheet.getCell(`E${rowNumber}`).protection = { locked: false };
      importSheet.getCell(`F${rowNumber}`).protection = { locked: false };
    }

    importSheet.getCell('C2').value = 'g';
    importSheet.getCell('D2').value = 0;
    importSheet.getCell('E2').value = 0;
    importSheet.getCell('F2').value = 0;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ingredients-import-template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const readWorkbookImportSheet = async (file: File) => {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const importSheet = workbook.getWorksheet('Import') ?? workbook.worksheets[0];
    if (!importSheet) {
      throw new Error('No worksheet found in workbook');
    }

    const maxColumns = Math.max(importSheet.columnCount, 6);
    const rows: string[][] = [];
    for (let rowNumber = 1; rowNumber <= importSheet.rowCount; rowNumber++) {
      const row = importSheet.getRow(rowNumber);
      const values: string[] = [];
      for (let col = 1; col <= maxColumns; col++) {
        values.push((row.getCell(col).text || '').trim());
      }
      if (values.some(value => value)) {
        rows.push(values);
      }
    }

    if (rows.length === 0) {
      throw new Error(t('admin.ingredients.bulkImportEmpty'));
    }

    setImportWorkbookName(file.name);
    setImportText(rows.map(row => row.join('\t')).join('\n'));
    setImportPreview(null);
    setImportResult(`Loaded Import sheet from ${file.name}`);
  };

  const analyzeIngredientImport = (): IngredientImportAnalysis => {
    const rows = parsePastedRows(importText);
    if (rows.length === 0) {
      throw new Error(t('admin.ingredients.bulkImportEmpty'));
    }

    const headerIndex = buildHeaderIndex(rows[0]);
    const detectedName = findColumnIndex(headerIndex, ['name', 'ten']);
    const detectedCode = findColumnIndex(headerIndex, ['ingredientCode', 'code', 'ma', 'manl']);
    const detectedUnit = findColumnIndex(headerIndex, ['unit', 'dvt', 'donvi', 'donvitinh']);
    const detectedStock = findColumnIndex(headerIndex, ['currentStock', 'stock', 'qty', 'sl', 'soluong']);
    const detectedTotalCost = findColumnIndex(headerIndex, ['totalCost', 'total', 'tongtien', 'thanhtien', 'cost', 'gia']);
    const detectedReorder = findColumnIndex(headerIndex, ['reorderLevel', 'reorder', 'nguongnhaplai', 'threshold']);

    const hasHeader = detectedName >= 0 || detectedCode >= 0 || detectedUnit >= 0 || detectedStock >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const codeIndex = hasHeader ? detectedCode : -1;
    const nameIndex = hasHeader ? detectedName : 0;
    const unitIndex = hasHeader ? detectedUnit : 1;
    const stockIndex = hasHeader ? detectedStock : 2;
    const totalCostIndex = hasHeader ? detectedTotalCost : 3;
    const reorderIndex = hasHeader ? detectedReorder : 4;

    const parsedRows: IngredientImportPayload[] = [];
    const errors: string[] = [];
    let totalRows = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const lineNo = hasHeader ? i + 2 : i + 1;
      if (!row || row.every(cell => !cell.trim())) {
        continue;
      }
      totalRows++;

      const codeRaw = codeIndex >= 0 ? (row[codeIndex] || '').trim() : '';
      const ingredientCode = codeRaw.startsWith('=') ? '' : normalizeIngredientCode(codeRaw);
      const name = nameIndex >= 0 ? (row[nameIndex] || '').trim() : '';
      const unitRaw = unitIndex >= 0 ? (row[unitIndex] || '').trim().toLowerCase() : '';
      const stockRaw = stockIndex >= 0 ? (row[stockIndex] || '').trim() : '';
      const totalCostRaw = totalCostIndex >= 0 ? (row[totalCostIndex] || '').trim() : '';
      const reorderRaw = reorderIndex >= 0 ? (row[reorderIndex] || '').trim() : '';

      if (!name || !unitRaw || !stockRaw) {
        errors.push(`Line ${lineNo}: missing required data`);
        continue;
      }

      if (!['g', 'ml', 'pcs'].includes(unitRaw)) {
        errors.push(`Line ${lineNo}: invalid unit "${unitRaw}"`);
        continue;
      }
      if (ingredientCode && !/^[A-Z0-9-]{3,20}$/.test(ingredientCode)) {
        errors.push(`Line ${lineNo}: invalid ingredientCode "${ingredientCode}"`);
        continue;
      }

      const currentStock = parseFlexibleNumber(stockRaw);
      const parsedCost = totalCostRaw ? parseFlexibleNumber(totalCostRaw) : NaN;
      const reorderLevel = reorderRaw ? parseFlexibleNumber(reorderRaw) : 0;
      if (!Number.isFinite(currentStock) || currentStock < 0 || !Number.isFinite(reorderLevel) || reorderLevel < 0) {
        errors.push(`Line ${lineNo}: invalid numeric value`);
        continue;
      }
      const totalCost = currentStock > 0 ? parsedCost : null;
      if (currentStock > 0 && (totalCost == null || !Number.isFinite(totalCost) || totalCost <= 0)) {
        errors.push(`Line ${lineNo}: totalCost is required when currentStock > 0`);
        continue;
      }

      parsedRows.push({
        name,
        ingredientCode,
        unit: unitRaw as 'g' | 'ml' | 'pcs',
        currentStock,
        reorderLevel,
        totalCost
      });
    }

    if (totalRows === 0) {
      throw new Error(t('admin.ingredients.bulkImportEmpty'));
    }

    return {
      rows: parsedRows,
      errors,
      totalRows
    };
  };

  const validateBulkImport = () => {
    try {
      const analysis = analyzeIngredientImport();
      setImportPreview(analysis);
      const previewErrors = analysis.errors.slice(0, 5).join(' | ');
      setImportResult(
        `${t('admin.ingredients.bulkImportPreview', {
          total: analysis.totalRows,
          valid: analysis.rows.length,
          invalid: analysis.errors.length
        })}${previewErrors ? ` (${previewErrors})` : ''}`
      );
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t('admin.ingredients.bulkImportFailed'));
    }
  };

  const importBulk = async () => {
    setImporting(true);
    try {
      const analysis = importPreview ?? analyzeIngredientImport();
      let imported = 0;
      const errors = [...analysis.errors];
      const existing = await api.listIngredients();
      const existingByCode = new Map<string, Ingredient>();
      const existingByNameUnit = new Map<string, Ingredient>();

      for (const ingredient of existing) {
        if (ingredient.ingredientCode && ingredient.ingredientCode.trim()) {
          existingByCode.set(normalizeIngredientCode(ingredient.ingredientCode), ingredient);
        }
        existingByNameUnit.set(normalizeIngredientKey(ingredient.name, ingredient.unit), ingredient);
      }

      for (const payload of analysis.rows) {
        try {
          const normalizedCode = normalizeIngredientCode(payload.ingredientCode || '');
          let target = normalizedCode ? existingByCode.get(normalizedCode) : undefined;

          if (!target) {
            target = existingByNameUnit.get(normalizeIngredientKey(payload.name, payload.unit));
          }

          if (target && target.unit !== payload.unit) {
            errors.push(`Ingredient "${payload.name}": unit mismatch with existing ingredient ${target.unit}`);
            continue;
          }

          if (!target) {
            const created = await api.createIngredient({
              name: payload.name,
              ingredientCode: normalizedCode || undefined,
              unit: payload.unit,
              currentStock: 0,
              reorderLevel: payload.reorderLevel,
              costTrackingMethod: 'AVG_BIN'
            });
            target = created;
            if (created.ingredientCode && created.ingredientCode.trim()) {
              existingByCode.set(normalizeIngredientCode(created.ingredientCode), created);
            }
            existingByNameUnit.set(normalizeIngredientKey(created.name, created.unit), created);
          }

          if (payload.currentStock > 0 && payload.totalCost != null) {
            await api.adjustIngredientStock(target.id, {
              type: 'IN',
              qty: payload.currentStock,
              inputUnit: payload.unit,
              totalCost: payload.totalCost,
              note: 'Bulk import initial stock'
            });
          }
          imported++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed';
          errors.push(`Ingredient "${payload.name}": ${message}`);
        }
      }

      const previewErrors = errors.slice(0, 5).join(' | ');
      setImportResult(
        `${t('admin.ingredients.bulkImportResult')}: imported=${imported}, skipped=${errors.length}${previewErrors ? ` (${previewErrors})` : ''}`
      );
      setImportPreview(null);
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
                <Button variant="outline" onClick={openBulkImportModal}>
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
              <div className="max-h-[58vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-white">
                    <TableRow>
                      <TableHead className="bg-white">{t('admin.ingredients.name')}</TableHead>
                      <TableHead className="bg-white">
                        <div className="space-y-1">
                          <p>{t('admin.ingredients.unit')}</p>
                          <Select value={unitDisplayMode} onChange={e => setUnitDisplayMode(e.target.value as UnitDisplayMode)}>
                            <option value="small">{t('admin.ingredients.unitSmall')}</option>
                            <option value="large">{t('admin.ingredients.unitLarge')}</option>
                          </Select>
                        </div>
                      </TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.stock')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.reorder')}</TableHead>
                      <TableHead className="bg-white"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => {
                      const isExpanded = !!expandedLots[item.id];
                      const lots = lotsByIngredient[item.id] || [];
                      const isLotLoading = !!lotLoading[item.id];
                      const lotLoadError = lotError[item.id] || '';
                      return [
                        <TableRow key={item.id} className="cursor-pointer hover:bg-[#f8f1e8]/60" onClick={() => openDetail(item)}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-md border border-border bg-white px-2 py-0.5 text-xs text-muted hover:bg-[#f5ede3] hover:text-ink"
                                  onClick={event => {
                                    event.stopPropagation();
                                    toggleLots(item.id);
                                  }}
                                >
                                  {isExpanded ? '▾' : '▸'}
                                </button>
                                <span>{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>{convertUnit(item.unit, unitDisplayMode)}</TableCell>
                            <TableCell>{formatQty(convertQty(Number(item.currentStock || 0), item.unit, unitDisplayMode))}</TableCell>
                            <TableCell>{formatQty(convertQty(Number(item.reorderLevel || 0), item.unit, unitDisplayMode))}</TableCell>
                            <TableCell className="text-right" onClick={event => event.stopPropagation()}>
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
                        </TableRow>,
                        isExpanded ? (
                            <TableRow key={`${item.id}-lots`} className="bg-[#fbf7f0]">
                              <TableCell colSpan={5}>
                                <div className="space-y-2">
                                  <p className="text-sm font-semibold text-muted">{t('admin.ingredients.lotsTitle')}</p>
                                  {isLotLoading ? (
                                    <p className="text-sm text-muted">{t('admin.ingredients.lotLoading')}</p>
                                  ) : lotLoadError ? (
                                    <p className="text-sm text-red-600">{lotLoadError}</p>
                                  ) : lots.length === 0 ? (
                                    <p className="text-sm text-muted">{t('admin.ingredients.lotEmpty')}</p>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>{t('admin.ingredients.lotCode')}</TableHead>
                                          <TableHead>{t('admin.ingredients.lotReceivedAt')}</TableHead>
                                          <TableHead>{t('admin.ingredients.lotReceivedQty')}</TableHead>
                                          <TableHead>{t('admin.ingredients.lotRemainingQty')}</TableHead>
                                          <TableHead>{t('admin.ingredients.lotUnitCost')}</TableHead>
                                          <TableHead>{t('admin.ingredients.lotTotalCost')}</TableHead>
                                          <TableHead>{t('admin.ingredients.lotReference')}</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {lots.map(lot => {
                                          const receivedQty = Number(lot.qty || 0);
                                          const remainingQty = Number(lot.remainingQty || 0);
                                          const unitCost = Number(lot.unitCost || 0);
                                          return (
                                            <TableRow key={lot.id}>
                                              <TableCell>{lot.lotCode || '-'}</TableCell>
                                              <TableCell>{new Date(lot.createdAt).toLocaleString()}</TableCell>
                                              <TableCell>
                                                {formatQty(convertQty(receivedQty, lot.ingredientUnit || item.unit, unitDisplayMode))}{' '}
                                                {convertUnit(lot.ingredientUnit || item.unit, unitDisplayMode)}
                                              </TableCell>
                                              <TableCell>
                                                {formatQty(convertQty(remainingQty, lot.ingredientUnit || item.unit, unitDisplayMode))}{' '}
                                                {convertUnit(lot.ingredientUnit || item.unit, unitDisplayMode)}
                                              </TableCell>
                                              <TableCell>{lot.unitCost == null ? '-' : formatCost(unitCost)}</TableCell>
                                              <TableCell>{lot.unitCost == null ? '-' : formatCost(receivedQty * unitCost)}</TableCell>
                                              <TableCell>{lot.note || '-'}</TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null
                      ];
                    })}
                  </TableBody>
                </Table>
              </div>
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
              <div className="max-h-[58vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-white">
                    <TableRow>
                      <TableHead className="bg-white">{t('admin.ingredients.txTime')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.name')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.txAction')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.txQty')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.unit')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.txLot')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.txRemaining')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.restockNote')}</TableHead>
                      <TableHead className="bg-white">{t('admin.ingredients.txBy')}</TableHead>
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
              </div>
            )}
          </Card>

          <Dialog open={detailOpen} onOpenChange={closeDetailModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.ingredients.detailTitle')}</DialogTitle>
              </DialogHeader>
              {detailTarget ? (
                <div className="space-y-3">
                  <FormField label={t('admin.ingredients.name')}>
                    <Input value={detailTarget.name} readOnly />
                  </FormField>
                  <FormField label={t('admin.ingredients.ingredientCode')}>
                    <Input value={detailTarget.ingredientCode || '-'} readOnly />
                  </FormField>
                  <FormField label={t('admin.ingredients.unit')}>
                    <Input value={convertUnit(detailTarget.unit, unitDisplayMode)} readOnly />
                  </FormField>
                  <FormField label={t('admin.ingredients.currentStock')}>
                    <Input value={formatQty(convertQty(Number(detailTarget.currentStock || 0), detailTarget.unit, unitDisplayMode))} readOnly />
                  </FormField>
                  <FormField label={t('admin.ingredients.reorderLevel')}>
                    <Input value={formatQty(convertQty(Number(detailTarget.reorderLevel || 0), detailTarget.unit, unitDisplayMode))} readOnly />
                  </FormField>
                  <FormField label={t('admin.ingredients.costTracking')}>
                    <Input value={detailTarget.costTrackingMethod || '-'} readOnly />
                  </FormField>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={closeIngredientModal}>
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
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button type="button" variant="ghost" onClick={() => closeIngredientModal(false)}>
                    {t('common.close')}
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelIngredientModal}>
                    {t('common.cancel')}
                  </Button>
                  <Button>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={restockOpen} onOpenChange={closeRestockModal}>
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
                <FormField label={t('admin.ingredients.totalCost')}>
                  <Input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={restockTotalCost}
                    onChange={e => setRestockTotalCost(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label={t('admin.ingredients.restockNote')}>
                  <Input value={restockNote} onChange={e => setRestockNote(e.target.value)} />
                </FormField>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button type="button" variant="ghost" onClick={() => closeRestockModal(false)}>
                    {t('common.close')}
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelRestockModal}>
                    {t('common.cancel')}
                  </Button>
                  <Button>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={importOpen} onOpenChange={closeImportModal}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('admin.ingredients.bulkImportTitle')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-[#f8f1e8] p-3">
                  <p className="text-sm font-semibold">{t('admin.ingredients.bulkImportGuideTitle')}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                    <li>{t('admin.ingredients.bulkImportGuideRequired')}</li>
                    <li>{t('admin.ingredients.bulkImportGuideOptional')}</li>
                    <li>{t('admin.ingredients.bulkImportGuideNoHeader')}</li>
                    <li>{t('admin.ingredients.bulkImportGuideUnitRule')}</li>
                    <li>{t('admin.ingredients.bulkImportGuideDerived')}</li>
                  </ul>
                </div>
                <p className="text-sm text-muted">{t('admin.ingredients.bulkImportHint')}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => void downloadTemplate()}>
                    {t('admin.ingredients.bulkImportTemplate')}
                  </Button>
                  <Button type="button" variant="outline" onClick={validateBulkImport} disabled={importing}>
                    {t('admin.ingredients.bulkImportValidate')}
                  </Button>
                </div>
                <FormField label="Excel (.xlsx)">
                  <Input
                    type="file"
                    accept=".xlsx"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void readWorkbookImportSheet(file).catch(err => {
                        setImportResult(err instanceof Error ? err.message : t('admin.ingredients.bulkImportFailed'));
                      });
                    }}
                  />
                </FormField>
                {importWorkbookName ? <p className="text-xs text-muted">Workbook: {importWorkbookName}</p> : null}
                {rawPreviewRows.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Xem trước dữ liệu import</p>
                    <div className="max-h-72 overflow-auto rounded-lg border border-border bg-white">
                      <Table className="min-w-max border-separate border-spacing-0 text-left">
                        <TableHeader className="sticky top-0 z-10 bg-[#f8f1e8]">
                          <TableRow>
                            {rawPreviewRows[0].map((header, index) => (
                              <TableHead key={`raw-head-${index}`} className="whitespace-nowrap border-b border-border/70 border-r border-border/40">
                                {header || `column_${index + 1}`}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rawPreviewRows.slice(1, 31).map((row, rowIndex) => (
                            <TableRow key={`raw-row-${rowIndex}`}>
                              {rawPreviewRows[0].map((_, columnIndex) => {
                                const value = row[columnIndex] ?? '';
                                return (
                                  <TableCell key={`raw-cell-${rowIndex}-${columnIndex}`} className="whitespace-nowrap border-b border-border/50 border-r border-border/30">
                                    {value ? value : <span className="text-muted">-</span>}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {rawPreviewRows.length > 31 ? <p className="text-xs text-muted">Hiển thị 30 dòng đầu tiên.</p> : null}
                  </div>
                ) : null}
                {importPreview ? (
                  <div className="space-y-2 rounded-xl border border-border bg-[#f8f1e8] p-3">
                    <p className="text-sm font-semibold">
                      {t('admin.ingredients.bulkImportPreview', {
                        total: importPreview.totalRows,
                        valid: importPreview.rows.length,
                        invalid: importPreview.errors.length
                      })}
                    </p>
                    {importPreview.rows.length > 0 ? (
                      <div className="max-h-72 overflow-auto rounded-lg border border-border bg-white">
                        <Table className="min-w-max w-full border-separate border-spacing-0">
                          <TableHeader className="sticky top-0 z-10 bg-[#f8f1e8]">
                            <TableRow>
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">Code</TableHead>
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">
                                {t('admin.ingredients.name')}
                              </TableHead>
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">
                                {t('admin.ingredients.unit')}
                              </TableHead>
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">
                                {t('admin.ingredients.currentStock')}
                              </TableHead>
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">
                                {t('admin.ingredients.totalCost')}
                              </TableHead>
                              <TableHead className="whitespace-nowrap border-b border-border/70">{t('admin.ingredients.reorderLevel')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {importPreview.rows.slice(0, 10).map((row, index) => (
                              <TableRow key={`${row.name}-${index}`}>
                                <TableCell className="whitespace-nowrap font-mono text-xs border-b border-border/50 border-r border-border/30">
                                  {row.ingredientCode || '-'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap border-b border-border/50 border-r border-border/30" title={row.name}>
                                  {row.name}
                                </TableCell>
                                <TableCell className="whitespace-nowrap uppercase border-b border-border/50 border-r border-border/30">
                                  {row.unit}
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums border-b border-border/50 border-r border-border/30">
                                  {row.currentStock}
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums border-b border-border/50 border-r border-border/30">
                                  {row.totalCost ?? '-'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums border-b border-border/50">{row.reorderLevel}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted">{t('admin.ingredients.bulkImportNoValidRowsPreview')}</p>
                    )}
                    {importPreview.errors.length > 0 ? (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-red-700">{t('admin.ingredients.bulkImportErrorPreview')}</p>
                        <ul className="list-disc space-y-1 pl-5 text-xs text-red-700">
                          {importPreview.errors.slice(0, 8).map(message => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {importResult ? <p className="text-sm text-muted">{importResult}</p> : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button type="button" variant="ghost" onClick={() => closeImportModal(false)} disabled={importing}>
                    {t('common.close')}
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelImportModal} disabled={importing}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="button" onClick={importBulk} disabled={importing}>
                    {importing ? t('admin.ingredients.bulkImportRunning') : t('admin.ingredients.bulkImportRun')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
