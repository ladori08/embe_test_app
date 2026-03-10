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

type IngredientImportRowStatus = 'ready' | 'error' | 'success' | 'failed';

type IngredientImportRow = {
  lineNo: number;
  ingredientCode: string;
  name: string;
  unit: string;
  currentStock: number | null;
  totalCost: number | null;
  reorderLevel: number | null;
  status: IngredientImportRowStatus;
  statusText: string;
  note: string;
  payload: IngredientImportPayload | null;
};

type IngredientImportAnalysis = {
  rows: IngredientImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
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

const normalizeIngredientCode = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === '-' || /^0([.,]0+)?$/.test(normalized)) {
    return '';
  }
  return normalized;
};
const normalizeImportUnit = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'psc') {
    return 'pcs';
  }
  return normalized;
};
const normalizeIngredientKey = (name: string, unit: string) => `${name.trim().toLowerCase()}::${unit.trim().toLowerCase()}`;

export default function AdminIngredientsPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bulkImportMessage, setBulkImportMessage] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

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
  const hasImportPreview = importPreview != null && importPreview.rows.length > 0;
  const hasImportErrors = importPreview != null && importPreview.invalidRows > 0;
  const canRunImport = hasImportPreview && !hasImportErrors && !importing;

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
    setRestockTotalCost('');
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

  const clearBulkImportState = () => {
    setImportText('');
    setImportResult('');
    setImportPreview(null);
    setImportWorkbookName('');
  };

  const closeBulkImportModal = () => {
    setImportOpen(false);
    clearBulkImportState();
  };

  const handleBulkImportOpenChange = (nextOpen: boolean) => {
    setImportOpen(nextOpen);
    if (!nextOpen) {
      clearBulkImportState();
    }
  };

  const openBulkImportModal = () => {
    clearBulkImportState();
    setImportOpen(true);
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

  const downloadTemplate = async () => {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.calcProperties.fullCalcOnLoad = true;
    const importSheet = workbook.addWorksheet('Import');
    const ingredientsSheet = workbook.addWorksheet('Ingredients');
    const ingredients = [...items].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    ingredientsSheet.columns = [
      { header: 'ingredientCode', key: 'ingredientCode', width: 18 },
      { header: 'name', key: 'name', width: 32 },
      { header: 'unit', key: 'unit', width: 12 }
    ];
    ingredients.forEach(ingredient => {
      ingredientsSheet.addRow({
        ingredientCode: ingredient.ingredientCode || '',
        name: ingredient.name,
        unit: ingredient.unit || ''
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
      const unitCell = importSheet.getCell(`C${rowNumber}`);
      unitCell.value = {
        formula: `IF(B${rowNumber}="","",IFERROR(XLOOKUP(B${rowNumber},Ingredients!$B:$B,Ingredients!$C:$C,""),IFERROR(INDEX(Ingredients!$C:$C,MATCH(B${rowNumber},Ingredients!$B:$B,0)),"")))`,
        result: ''
      };
      unitCell.protection = { locked: false };
      importSheet.getCell(`D${rowNumber}`).protection = { locked: false };
      importSheet.getCell(`E${rowNumber}`).protection = { locked: false };
      importSheet.getCell(`F${rowNumber}`).protection = { locked: false };
    }

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
    const existingByCode = new Map<string, Ingredient>();
    const existingByNameUnit = new Map<string, Ingredient>();
    for (const ingredient of items) {
      if (ingredient.ingredientCode && ingredient.ingredientCode.trim()) {
        existingByCode.set(normalizeIngredientCode(ingredient.ingredientCode), ingredient);
      }
      existingByNameUnit.set(normalizeIngredientKey(ingredient.name, ingredient.unit), ingredient);
    }

    const previewRows: IngredientImportRow[] = [];
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
      const normalizedUnit = normalizeImportUnit(unitRaw);
      const stockRaw = stockIndex >= 0 ? (row[stockIndex] || '').trim() : '';
      const totalCostRaw = totalCostIndex >= 0 ? (row[totalCostIndex] || '').trim() : '';
      const reorderRaw = reorderIndex >= 0 ? (row[reorderIndex] || '').trim() : '';
      const currentStock = stockRaw ? parseFlexibleNumber(stockRaw) : null;
      const parsedCost = totalCostRaw ? parseFlexibleNumber(totalCostRaw) : null;
      const reorderLevel = reorderRaw ? parseFlexibleNumber(reorderRaw) : 0;
      const makeRow = (
        status: IngredientImportRowStatus,
        note: string,
        payload: IngredientImportPayload | null,
        statusText = note
      ): IngredientImportRow => ({
        lineNo,
        ingredientCode,
        name,
        unit: normalizedUnit,
        currentStock,
        totalCost: parsedCost,
        reorderLevel,
        status,
        statusText,
        note,
        payload
      });

      if (!name || !unitRaw || !stockRaw) {
        previewRows.push(
          makeRow(
            'error',
            t('admin.ingredients.bulkImportRowMissingRequired', {
              lineNo
            }),
            null
          )
        );
        continue;
      }

      if (!['g', 'ml', 'pcs'].includes(normalizedUnit)) {
        previewRows.push(
          makeRow(
            'error',
            t('admin.ingredients.bulkImportRowInvalidUnit', {
              lineNo,
              unit: unitRaw || '-'
            }),
            null
          )
        );
        continue;
      }
      if (ingredientCode && !/^[A-Z0-9-]{3,20}$/.test(ingredientCode)) {
        previewRows.push(
          makeRow(
            'error',
            t('admin.ingredients.bulkImportRowInvalidCode', {
              lineNo,
              code: ingredientCode
            }),
            null
          )
        );
        continue;
      }

      if (
        currentStock == null ||
        !Number.isFinite(currentStock) ||
        currentStock < 0 ||
        reorderLevel == null ||
        !Number.isFinite(reorderLevel) ||
        reorderLevel < 0
      ) {
        previewRows.push(
          makeRow(
            'error',
            t('admin.ingredients.bulkImportRowInvalidNumeric', {
              lineNo
            }),
            null
          )
        );
        continue;
      }
      const totalCost = currentStock > 0 ? parsedCost : null;
      if (currentStock > 0 && (totalCost == null || !Number.isFinite(totalCost) || totalCost <= 0)) {
        previewRows.push(
          makeRow(
            'error',
            t('admin.ingredients.bulkImportRowTotalCostRequired', {
              lineNo
            }),
            null
          )
        );
        continue;
      }

      const payload: IngredientImportPayload = {
        name,
        ingredientCode,
        unit: normalizedUnit as 'g' | 'ml' | 'pcs',
        currentStock,
        reorderLevel,
        totalCost
      };
      let exists = false;
      if (ingredientCode) {
        exists = existingByCode.has(ingredientCode);
      }
      if (!exists) {
        exists = existingByNameUnit.has(normalizeIngredientKey(name, normalizedUnit));
      }
      const actionStatus = exists
        ? t('admin.ingredients.bulkImportStatusStockExisting')
        : t('admin.ingredients.bulkImportStatusCreateNew');
      previewRows.push(makeRow('ready', t('admin.ingredients.bulkImportRowReady'), payload, actionStatus));
    }

    if (totalRows === 0) {
      throw new Error(t('admin.ingredients.bulkImportEmpty'));
    }

    const validRows = previewRows.filter(row => row.status === 'ready').length;
    const invalidRows = previewRows.filter(row => row.status === 'error').length;

    return {
      rows: previewRows,
      totalRows,
      validRows,
      invalidRows
    };
  };

  const validateBulkImport = () => {
    try {
      const analysis = analyzeIngredientImport();
      setImportPreview(analysis);
      setImportResult(
        `${t('admin.ingredients.bulkImportPreview', {
          total: analysis.totalRows,
          valid: analysis.validRows,
          invalid: analysis.invalidRows
        })}`
      );
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t('admin.ingredients.bulkImportFailed'));
    }
  };

  const importBulk = async () => {
    setBulkImportMessage('');
    let analysis: IngredientImportAnalysis;
    try {
      analysis = importPreview ?? analyzeIngredientImport();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t('admin.ingredients.bulkImportFailed'));
      return;
    }

    if (analysis.invalidRows > 0) {
      setImportPreview(analysis);
      setImportResult(
        t('admin.ingredients.bulkImportBlockedByErrors', {
          count: analysis.invalidRows
        })
      );
      return;
    }

    setImporting(true);
    try {
      const previewRows = analysis.rows.map(row => ({ ...row }));
      let imported = 0;
      let failed = 0;
      const existing = await api.listIngredients();
      const existingByCode = new Map<string, Ingredient>();
      const existingByNameUnit = new Map<string, Ingredient>();

      for (const ingredient of existing) {
        if (ingredient.ingredientCode && ingredient.ingredientCode.trim()) {
          existingByCode.set(normalizeIngredientCode(ingredient.ingredientCode), ingredient);
        }
        existingByNameUnit.set(normalizeIngredientKey(ingredient.name, ingredient.unit), ingredient);
      }

      for (const row of previewRows) {
        if (row.status !== 'ready' || !row.payload) {
          continue;
        }

        const payload = row.payload;
        try {
          const normalizedCode = normalizeIngredientCode(payload.ingredientCode || '');
          let target = normalizedCode ? existingByCode.get(normalizedCode) : undefined;
          let created = false;
          let stocked = false;

          if (!target) {
            target = existingByNameUnit.get(normalizeIngredientKey(payload.name, payload.unit));
          }

          if (target && target.unit !== payload.unit) {
            row.status = 'failed';
            row.note = t('admin.ingredients.bulkImportRowUnitMismatch', {
              name: payload.name,
              unit: target.unit
            });
            row.statusText = row.note;
            failed++;
            continue;
          }

          if (!target) {
            const createdIngredient = await api.createIngredient({
              name: payload.name,
              ingredientCode: normalizedCode || undefined,
              unit: payload.unit,
              currentStock: 0,
              reorderLevel: payload.reorderLevel,
              costTrackingMethod: 'AVG_BIN'
            });
            target = createdIngredient;
            created = true;
            if (createdIngredient.ingredientCode && createdIngredient.ingredientCode.trim()) {
              existingByCode.set(normalizeIngredientCode(createdIngredient.ingredientCode), createdIngredient);
            }
            existingByNameUnit.set(normalizeIngredientKey(createdIngredient.name, createdIngredient.unit), createdIngredient);
          }

          if (payload.currentStock > 0 && payload.totalCost != null) {
            await api.adjustIngredientStock(target.id, {
              type: 'IN',
              qty: payload.currentStock,
              inputUnit: payload.unit,
              totalCost: payload.totalCost,
              note: 'Bulk import initial stock'
            });
            stocked = true;
          }

          if (created && stocked) {
            row.note = t('admin.ingredients.bulkImportRowSuccessCreateAndStock', {
              qty: payload.currentStock,
              unit: payload.unit,
              totalCost: payload.totalCost ?? 0
            });
          } else if (created) {
            row.note = t('admin.ingredients.bulkImportRowSuccessCreateOnly');
          } else if (stocked) {
            row.note = t('admin.ingredients.bulkImportRowSuccessStockOnly', {
              qty: payload.currentStock,
              unit: payload.unit,
              totalCost: payload.totalCost ?? 0
            });
          } else {
            row.note = t('admin.ingredients.bulkImportRowSuccessNoStock');
          }
          row.status = 'success';
          imported++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed';
          row.status = 'failed';
          row.note = t('admin.ingredients.bulkImportRowFailed', {
            name: payload.name,
            message
          });
          row.statusText = row.note;
          failed++;
        }
      }

      const validRows = previewRows.filter(row => row.status === 'success').length;
      const invalidRows = previewRows.filter(row => row.status === 'failed' || row.status === 'error').length;
      const importSummary = `${t('admin.ingredients.bulkImportResult')}: imported=${imported}, failed=${failed}`;
      setImportPreview({
        rows: previewRows,
        totalRows: previewRows.length,
        validRows,
        invalidRows
      });
      setImportResult(importSummary);
      if (failed === 0) {
        closeBulkImportModal();
        setBulkImportMessage(
          t('admin.ingredients.bulkImportSuccessMessage', {
            count: imported
          })
        );
      }
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

  const rawPreviewStatusByLine = (() => {
    const map = new Map<number, string>();
    if (!importText.trim()) {
      return map;
    }
    try {
      const analysis = analyzeIngredientImport();
      analysis.rows.forEach(row => {
        map.set(row.lineNo, row.statusText || row.note);
      });
    } catch {
      return map;
    }
    return map;
  })();

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
            {bulkImportMessage ? <p className="mb-3 text-sm text-green-700">{bulkImportMessage}</p> : null}
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
                <Button className="w-full">{t('common.save')}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={importOpen} onOpenChange={handleBulkImportOpenChange}>
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
                  <Button type="button" variant="outline" onClick={closeBulkImportModal} disabled={importing}>
                    {t('common.cancel')}
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
                            <TableHead className="whitespace-nowrap border-b border-border/70">{t('admin.ingredients.bulkImportStatus')}</TableHead>
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
                              <TableCell className="whitespace-nowrap border-b border-border/50">
                                {rawPreviewStatusByLine.get(rowIndex + 2) || '-'}
                              </TableCell>
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
                        valid: importPreview.validRows,
                        invalid: importPreview.invalidRows
                      })}
                    </p>
                    {importPreview.rows.length > 0 ? (
                      <div className="max-h-72 overflow-auto rounded-lg border border-border bg-white">
                        <Table className="min-w-max w-full border-separate border-spacing-0">
                          <TableHeader className="sticky top-0 z-10 bg-[#f8f1e8]">
                            <TableRow>
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">Line</TableHead>
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
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">
                                {t('admin.ingredients.reorderLevel')}
                              </TableHead>
                              <TableHead className="whitespace-nowrap border-b border-border/70 border-r border-border/40">
                                {t('admin.ingredients.bulkImportStatus')}
                              </TableHead>
                              <TableHead className="whitespace-nowrap border-b border-border/70">{t('admin.ingredients.bulkImportNote')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {importPreview.rows.slice(0, 30).map((row, index) => (
                              <TableRow key={`${row.lineNo}-${row.name}-${index}`}>
                                <TableCell className="whitespace-nowrap tabular-nums border-b border-border/50 border-r border-border/30">
                                  {row.lineNo}
                                </TableCell>
                                <TableCell className="whitespace-nowrap font-mono text-xs border-b border-border/50 border-r border-border/30">
                                  {row.ingredientCode || '-'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap border-b border-border/50 border-r border-border/30" title={row.name}>
                                  {row.name}
                                </TableCell>
                                <TableCell className="whitespace-nowrap uppercase border-b border-border/50 border-r border-border/30">
                                  {row.unit || '-'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums border-b border-border/50 border-r border-border/30">
                                  {row.currentStock ?? '-'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums border-b border-border/50 border-r border-border/30">
                                  {row.totalCost ?? '-'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums border-b border-border/50 border-r border-border/30">
                                  {row.reorderLevel ?? '-'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap border-b border-border/50 border-r border-border/30">
                                  <span
                                    className={
                                      row.status === 'error' || row.status === 'failed'
                                        ? 'text-red-700'
                                        : row.status === 'success'
                                          ? 'text-green-700'
                                          : 'text-amber-700'
                                    }
                                  >
                                    {row.statusText}
                                  </span>
                                </TableCell>
                                <TableCell className="border-b border-border/50">{row.note}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted">{t('admin.ingredients.bulkImportNoValidRowsPreview')}</p>
                    )}
                    {importPreview.rows.length > 30 ? <p className="text-xs text-muted">Hiển thị 30 dòng đầu tiên.</p> : null}
                  </div>
                ) : null}
                {importResult ? <p className="text-sm text-muted">{importResult}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeBulkImportModal} disabled={importing}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="button" onClick={importBulk} disabled={!canRunImport}>
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
