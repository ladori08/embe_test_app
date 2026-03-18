'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { resolveProductImageUrl } from '@/lib/product-images';
import { MediaImage } from '@/lib/types';

const MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_MB = 25;
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'jfif']);
const CROP_ASPECT_RATIO = 16 / 9;
const CROP_OUTPUT_WIDTH = 1600;
const CROP_OUTPUT_HEIGHT = Math.round(CROP_OUTPUT_WIDTH / CROP_ASPECT_RATIO);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Dimensions = { width: number; height: number };

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};

const formatSize = (value: number) => {
  const bytes = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getCoverSize = (imageSize: Dimensions, viewportSize: Dimensions): Dimensions => {
  if (imageSize.width <= 0 || imageSize.height <= 0 || viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.max(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height);
  return {
    width: imageSize.width * scale,
    height: imageSize.height * scale
  };
};

const clampCropOffsets = ({
  offsetX,
  offsetY,
  zoom,
  baseImageSize,
  viewportSize
}: {
  offsetX: number;
  offsetY: number;
  zoom: number;
  baseImageSize: Dimensions;
  viewportSize: Dimensions;
}) => {
  if (baseImageSize.width <= 0 || baseImageSize.height <= 0 || viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { x: 0, y: 0 };
  }
  const scaledWidth = baseImageSize.width * zoom;
  const scaledHeight = baseImageSize.height * zoom;
  const maxOffsetX = Math.max(0, (scaledWidth - viewportSize.width) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - viewportSize.height) / 2);
  return {
    x: clamp(offsetX, -maxOffsetX, maxOffsetX),
    y: clamp(offsetY, -maxOffsetY, maxOffsetY)
  };
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    image.src = objectUrl;
  });

const buildCroppedFileName = (name: string, extension: string) => {
  const clean = String(name || 'media-image').trim();
  const dotIndex = clean.lastIndexOf('.');
  const baseName = dotIndex > 0 ? clean.slice(0, dotIndex) : clean;
  return `${baseName}-cropped.${extension}`;
};

const cropImageFile = async ({
  file,
  zoom,
  offsetX,
  offsetY,
  viewportSize
}: {
  file: File;
  zoom: number;
  offsetX: number;
  offsetY: number;
  viewportSize: Dimensions;
}) => {
  const image = await loadImageFromFile(file);
  const imageSize = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    throw new Error('Image has invalid dimensions');
  }

  const previewViewport = {
    width: viewportSize.width > 0 ? viewportSize.width : CROP_OUTPUT_WIDTH,
    height: viewportSize.height > 0 ? viewportSize.height : CROP_OUTPUT_HEIGHT
  };
  const previewBaseSize = getCoverSize(imageSize, previewViewport);
  const clampedOffsets = clampCropOffsets({
    offsetX,
    offsetY,
    zoom,
    baseImageSize: previewBaseSize,
    viewportSize: previewViewport
  });

  const canvas = document.createElement('canvas');
  canvas.width = CROP_OUTPUT_WIDTH;
  canvas.height = CROP_OUTPUT_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  const outputScaleX = CROP_OUTPUT_WIDTH / previewViewport.width;
  const outputScaleY = CROP_OUTPUT_HEIGHT / previewViewport.height;
  const previewDrawWidth = previewBaseSize.width * zoom;
  const previewDrawHeight = previewBaseSize.height * zoom;
  const drawWidth = previewDrawWidth * outputScaleX;
  const drawHeight = previewDrawHeight * outputScaleY;
  const drawX = (CROP_OUTPUT_WIDTH - drawWidth) / 2 + clampedOffsets.x * outputScaleX;
  const drawY = (CROP_OUTPUT_HEIGHT - drawHeight) / 2 + clampedOffsets.y * outputScaleY;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  const preferredType =
    file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const extension = preferredType === 'image/png' ? 'png' : preferredType === 'image/webp' ? 'webp' : 'jpg';
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, preferredType, 0.92));
  if (!blob) {
    throw new Error('Failed to export cropped image');
  }
  return new File([blob], buildCroppedFileName(file.name, extension), {
    type: preferredType,
    lastModified: Date.now()
  });
};

export default function AdminMediaPage() {
  const [items, setItems] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingFileName, setDeletingFileName] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropProcessing, setCropProcessing] = useState(false);
  const [cropCurrentFile, setCropCurrentFile] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState('');
  const [cropPendingFiles, setCropPendingFiles] = useState<File[]>([]);
  const [cropProcessedFiles, setCropProcessedFiles] = useState<File[]>([]);
  const [cropValidationErrors, setCropValidationErrors] = useState<string[]>([]);
  const [cropTotalCount, setCropTotalCount] = useState(0);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [cropImageSize, setCropImageSize] = useState<Dimensions>({ width: 0, height: 0 });
  const [cropViewportSize, setCropViewportSize] = useState<Dimensions>({ width: 0, height: 0 });
  const [cropDragging, setCropDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const cropViewportRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useI18n();

  const loadMediaImages = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.listMediaImages();
      setItems(rows);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.media.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadMediaImages();
  }, [loadMediaImages]);

  useEffect(
    () => () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    },
    [cropSourceUrl]
  );

  useEffect(() => {
    if (!cropDialogOpen || !cropViewportRef.current) {
      return;
    }
    const node = cropViewportRef.current;
    const updateViewportSize = () => {
      setCropViewportSize({
        width: node.clientWidth,
        height: node.clientHeight
      });
    };
    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cropDialogOpen, cropCurrentFile?.name]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => String(item.fileName || '').toLowerCase().includes(q));
  }, [items, search]);

  const cropBaseImageSize = useMemo(() => getCoverSize(cropImageSize, cropViewportSize), [cropImageSize, cropViewportSize]);

  useEffect(() => {
    if (!cropDialogOpen) return;
    const clamped = clampCropOffsets({
      offsetX: cropOffsetX,
      offsetY: cropOffsetY,
      zoom: cropZoom,
      baseImageSize: cropBaseImageSize,
      viewportSize: cropViewportSize
    });
    if (Math.abs(clamped.x - cropOffsetX) > 0.5) {
      setCropOffsetX(clamped.x);
    }
    if (Math.abs(clamped.y - cropOffsetY) > 0.5) {
      setCropOffsetY(clamped.y);
    }
  }, [cropDialogOpen, cropOffsetX, cropOffsetY, cropZoom, cropBaseImageSize, cropViewportSize]);

  const resetCropState = () => {
    setCropDialogOpen(false);
    setCropProcessing(false);
    setCropCurrentFile(null);
    setCropSourceUrl('');
    setCropPendingFiles([]);
    setCropProcessedFiles([]);
    setCropValidationErrors([]);
    setCropTotalCount(0);
    setCropZoom(1);
    setCropOffsetX(0);
    setCropOffsetY(0);
    setCropImageSize({ width: 0, height: 0 });
    setCropViewportSize({ width: 0, height: 0 });
    setCropDragging(false);
    dragStateRef.current = null;
  };

  const uploadValidatedFiles = async (validFiles: File[], validationErrors: string[]) => {
    if (validFiles.length === 0) {
      setUploadError(validationErrors.join('\n') || t('admin.products.imageUploadFailed'));
      setUploadMessage('');
      return;
    }

    setUploading(true);
    const uploadErrors: string[] = [];
    let uploadedCount = 0;
    try {
      for (const file of validFiles) {
        try {
          await api.uploadProductImage(file);
          uploadedCount += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : t('admin.products.imageUploadFailed');
          uploadErrors.push(`${file.name}: ${message}`);
        }
      }
      if (uploadedCount > 0) {
        await loadMediaImages();
      }
    } finally {
      setUploading(false);
    }

    const allErrors = [...validationErrors, ...uploadErrors];
    setUploadError(allErrors.join('\n'));
    setUploadMessage(uploadedCount > 0 ? t('admin.media.uploadDone', { count: uploadedCount }) : '');
  };

  const openCropDialogForImages = (files: File[], validationErrors: string[]) => {
    if (files.length === 0) {
      setUploadError(validationErrors.join('\n'));
      return;
    }
    const [firstFile, ...remaining] = files;
    setCropCurrentFile(firstFile);
    setCropSourceUrl(URL.createObjectURL(firstFile));
    setCropPendingFiles(remaining);
    setCropProcessedFiles([]);
    setCropValidationErrors(validationErrors);
    setCropTotalCount(files.length);
    setCropZoom(1);
    setCropOffsetX(0);
    setCropOffsetY(0);
    setCropImageSize({ width: 0, height: 0 });
    setCropProcessing(false);
    setCropDragging(false);
    dragStateRef.current = null;
    setCropDialogOpen(true);
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const selected = Array.from(files);
    const validFiles: File[] = [];
    const validationErrors: string[] = [];

    for (const file of selected) {
      const lowerName = String(file.name || '').trim().toLowerCase();
      const dotIndex = lowerName.lastIndexOf('.');
      const extension = dotIndex >= 0 ? lowerName.substring(dotIndex + 1) : '';
      const imageMime = String(file.type || '').toLowerCase().startsWith('image/');
      if (file.size <= 0) {
        validationErrors.push(t('admin.products.imageFileEmpty', { name: file.name }));
        continue;
      }
      if (!extension || !ALLOWED_IMAGE_EXTENSIONS.has(extension) || !imageMime) {
        validationErrors.push(t('admin.products.imageFileTypeInvalid', { name: file.name }));
        continue;
      }
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        validationErrors.push(t('admin.products.imageFileTooLarge', { name: file.name, maxMb: MAX_IMAGE_UPLOAD_MB }));
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      setUploadError(validationErrors.join('\n') || t('admin.products.imageUploadFailed'));
      setUploadMessage('');
      return;
    }

    setUploadError('');
    setUploadMessage('');
    openCropDialogForImages(validFiles, validationErrors);
  };

  const cancelCropDialog = () => {
    const validationErrors = [...cropValidationErrors];
    resetCropState();
    setUploadError(validationErrors.join('\n'));
  };

  const applyCropAndContinue = async () => {
    if (!cropCurrentFile || cropProcessing) {
      return;
    }
    setCropProcessing(true);

    const validationErrors = [...cropValidationErrors];
    const processedFiles = [...cropProcessedFiles];
    const pendingFiles = [...cropPendingFiles];
    const currentFile = cropCurrentFile;
    const currentZoom = cropZoom;
    const currentOffsetX = cropOffsetX;
    const currentOffsetY = cropOffsetY;
    const currentViewport = { ...cropViewportSize };
    let processedFile = currentFile;

    try {
      processedFile = await cropImageFile({
        file: currentFile,
        zoom: currentZoom,
        offsetX: currentOffsetX,
        offsetY: currentOffsetY,
        viewportSize: currentViewport
      });
    } catch {
      validationErrors.push(t('admin.media.cropFailed', { name: currentFile.name }));
    }

    const nextProcessedFiles = [...processedFiles, processedFile];
    if (pendingFiles.length > 0) {
      const [nextFile, ...remaining] = pendingFiles;
      setCropProcessedFiles(nextProcessedFiles);
      setCropPendingFiles(remaining);
      setCropValidationErrors(validationErrors);
      setCropCurrentFile(nextFile);
      setCropSourceUrl(URL.createObjectURL(nextFile));
      setCropZoom(1);
      setCropOffsetX(0);
      setCropOffsetY(0);
      setCropImageSize({ width: 0, height: 0 });
      setCropProcessing(false);
      return;
    }

    resetCropState();
    await uploadValidatedFiles(nextProcessedFiles, validationErrors);
  };

  const handleCropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropCurrentFile || event.button !== 0) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: cropOffsetX,
      startOffsetY: cropOffsetY
    };
    setCropDragging(true);
  };

  const handleCropPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const nextOffsetX = dragState.startOffsetX + (event.clientX - dragState.startX);
    const nextOffsetY = dragState.startOffsetY + (event.clientY - dragState.startY);
    const clamped = clampCropOffsets({
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
      zoom: cropZoom,
      baseImageSize: cropBaseImageSize,
      viewportSize: cropViewportSize
    });
    setCropOffsetX(clamped.x);
    setCropOffsetY(clamped.y);
  };

  const stopCropDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState && dragState.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragStateRef.current = null;
      setCropDragging(false);
    }
  };

  const handleCropWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!cropCurrentFile) return;
    event.preventDefault();
    const nextZoom = clamp(cropZoom - event.deltaY * 0.0015, MIN_ZOOM, MAX_ZOOM);
    const clamped = clampCropOffsets({
      offsetX: cropOffsetX,
      offsetY: cropOffsetY,
      zoom: nextZoom,
      baseImageSize: cropBaseImageSize,
      viewportSize: cropViewportSize
    });
    setCropZoom(nextZoom);
    setCropOffsetX(clamped.x);
    setCropOffsetY(clamped.y);
  };

  const copyImageUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(resolveProductImageUrl(url));
      setUploadMessage(t('admin.media.copied'));
      setUploadError('');
    } catch {
      setUploadError(t('admin.media.copyFailed'));
    }
  };

  const deleteImage = async (fileName: string) => {
    if (!window.confirm(t('admin.media.deleteConfirm', { name: fileName }))) {
      return;
    }
    setDeletingFileName(fileName);
    try {
      await api.deleteMediaImage(fileName);
      setUploadMessage(t('admin.media.deleteSuccess', { name: fileName }));
      setUploadError('');
      await loadMediaImages();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('admin.media.deleteFailed', { name: fileName }));
    } finally {
      setDeletingFileName('');
    }
  };

  const cropCurrentIndex = cropTotalCount > 0 ? cropTotalCount - cropPendingFiles.length : 0;

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.media')}>
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">{t('admin.media.help')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={t('admin.media.searchPlaceholder')}
                  className="min-w-[220px]"
                />
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={event => {
                    const files = event.target.files;
                    void uploadImages(files);
                    event.currentTarget.value = '';
                  }}
                />
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
                  {uploading ? t('admin.media.uploading') : t('admin.media.add')}
                </Button>
              </div>
            </div>

            {uploadMessage ? <p className="mb-2 text-xs text-muted">{uploadMessage}</p> : null}
            {uploadError ? <p className="mb-2 whitespace-pre-line text-xs text-red-600">{uploadError}</p> : null}

            {loading ? (
              <p className="text-sm text-muted">{t('admin.media.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.media.empty')}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted">{t('admin.media.count', { count: filteredItems.length })}</p>
                <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-cream p-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredItems.map(item => (
                      <div key={item.fileName} className="rounded-xl border border-border bg-white p-2">
                        <img
                          src={resolveProductImageUrl(item.url)}
                          alt={item.fileName}
                          className="aspect-[16/9] w-full rounded-lg border border-border object-cover"
                          onError={event => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="mt-2 space-y-1">
                          <p className="truncate text-xs font-semibold text-ink" title={item.fileName}>
                            {item.fileName}
                          </p>
                          <p className="text-xs text-muted">
                            {formatSize(item.sizeBytes)} • {new Date(item.lastModified).toLocaleString()}
                          </p>
                          <Button type="button" variant="outline" className="w-full" onClick={() => void copyImageUrl(item.url)}>
                            {t('admin.media.copyUrl')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => void deleteImage(item.fileName)}
                            disabled={deletingFileName === item.fileName}
                          >
                            {deletingFileName === item.fileName ? t('admin.media.deleting') : t('admin.media.delete')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </AdminShell>
      </RequireRole>

      <Dialog
        open={cropDialogOpen}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            cancelCropDialog();
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('admin.media.cropTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted">{t('admin.media.cropHint')}</p>
          <p className="text-xs text-muted">{t('admin.media.cropProgress', { current: cropCurrentIndex, total: cropTotalCount })}</p>
          <div
            ref={cropViewportRef}
            className={`relative mt-2 w-full overflow-hidden rounded-xl border border-border bg-[#f8f1e8] ${cropDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ aspectRatio: `${CROP_OUTPUT_WIDTH}/${CROP_OUTPUT_HEIGHT}`, touchAction: 'none' }}
            onPointerDown={handleCropPointerDown}
            onPointerMove={handleCropPointerMove}
            onPointerUp={stopCropDragging}
            onPointerCancel={stopCropDragging}
            onWheel={handleCropWheel}
          >
            {cropSourceUrl ? (
              <img
                src={cropSourceUrl}
                alt={cropCurrentFile?.name || 'crop-preview'}
                className="pointer-events-none absolute left-1/2 top-1/2 select-none"
                style={{
                  width: cropBaseImageSize.width > 0 ? `${cropBaseImageSize.width}px` : '100%',
                  height: cropBaseImageSize.height > 0 ? `${cropBaseImageSize.height}px` : '100%',
                  maxWidth: 'none',
                  transform: `translate(calc(-50% + ${cropOffsetX}px), calc(-50% + ${cropOffsetY}px)) scale(${cropZoom})`,
                  transformOrigin: 'center center'
                }}
                onLoad={event => {
                  setCropImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight
                  });
                }}
              />
            ) : null}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={cancelCropDialog} disabled={cropProcessing}>
              {t('admin.media.cropCancel')}
            </Button>
            <Button type="button" onClick={() => void applyCropAndContinue()} disabled={cropProcessing || !cropCurrentFile}>
              {cropProcessing ? t('admin.media.cropProcessing') : t('admin.media.cropApply')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
