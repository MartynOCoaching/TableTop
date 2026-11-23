import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Film,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Maximize2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DashboardTab, MediaKind, PortalState } from '../types';
import {
  listStoredMediaBlobs,
  StoredMediaBlobEntry,
} from '../utils/storage';
import { MediaAsset } from './MediaAsset';

interface ServerMediaFile {
  filename: string;
  url: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
  createdAt: number;
  updatedAt: number;
}

export interface MediaUsageRef {
  sourceType: 'promotion' | 'menu' | 'special';
  sourceId: string;
  label: string;
  active?: boolean;
}

export interface StoredMediaEntry {
  key: string;
  label: string;
  previewUrl: string;
  serverUrl?: string;
  serverFilename?: string;
  assetId?: string;
  kind: MediaKind;
  sizeBytes?: number;
  createdAt?: number;
  storageSource: 'server' | 'local' | 'both' | 'external';
  usages: MediaUsageRef[];
}

type MediaFilter = 'all' | 'unused' | 'used' | 'image' | 'video';

interface MediaLibraryManagerProps {
  state: PortalState;
  onDeleteMedia: (entry: StoredMediaEntry) => Promise<void>;
  onDeleteUnusedMedia: (entries: StoredMediaEntry[]) => Promise<void>;
  onNavigateTab: (tab: DashboardTab) => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function formatDateShort(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function extractServerFilename(url?: string): string | undefined {
  if (!url || !url.startsWith('/api/media/')) return undefined;
  const raw = url.slice('/api/media/'.length).split('?')[0];
  return raw || undefined;
}

function deriveLabelFromUrl(url?: string): string {
  if (!url) return 'Stored media asset';
  if (url.startsWith('/api/media/')) {
    return url.slice('/api/media/'.length);
  }
  if (url.startsWith('/')) {
    const seg = url.split('/').pop();
    return seg || url;
  }
  if (url.startsWith('blob:')) {
    return 'Browser-cached upload';
  }
  try {
    const parsed = new URL(url);
    const seg = parsed.pathname.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : parsed.hostname;
  } catch {
    return 'External media';
  }
}

export const MediaLibraryManager: React.FC<MediaLibraryManagerProps> = ({
  state,
  onDeleteMedia,
  onDeleteUnusedMedia,
  onNavigateTab,
}) => {
  const [serverFiles, setServerFiles] = useState<ServerMediaFile[]>([]);
  const [localBlobs, setLocalBlobs] = useState<StoredMediaBlobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [confirmBulkUnused, setConfirmBulkUnused] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [lightboxEntry, setLightboxEntry] = useState<StoredMediaEntry | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const revokeBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // Ignore revoke errors
      }
    });
    blobUrlsRef.current = [];
  }, []);

  const refreshInventory = useCallback(async () => {
    setLoading(true);
    try {
      const [serverRes, blobs] = await Promise.all([
        fetch('/api/media', { cache: 'no-store' })
          .then(async (r) => {
            if (!r.ok) return [] as ServerMediaFile[];
            const data = (await r.json()) as { files?: ServerMediaFile[] };
            return Array.isArray(data.files) ? data.files : [];
          })
          .catch(() => [] as ServerMediaFile[]),
        listStoredMediaBlobs(),
      ]);

      revokeBlobUrls();
      blobUrlsRef.current = blobs.map((b) => b.objectUrl);
      setServerFiles(serverRes);
      setLocalBlobs(blobs);
    } finally {
      setLoading(false);
    }
  }, [revokeBlobUrls]);

  useEffect(() => {
    void refreshInventory();
    return () => {
      revokeBlobUrls();
    };
  }, [refreshInventory, revokeBlobUrls]);

  useEffect(() => {
    if (!lightboxEntry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxEntry(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxEntry]);

  const entries = useMemo<StoredMediaEntry[]>(() => {
    const serverByUrl = new Map<string, ServerMediaFile>();
    const serverByFilename = new Map<string, ServerMediaFile>();
    serverFiles.forEach((f) => {
      serverByUrl.set(f.url, f);
      serverByFilename.set(f.filename, f);
    });

    const blobByAssetId = new Map<string, StoredMediaBlobEntry>();
    localBlobs.forEach((b) => {
      blobByAssetId.set(b.assetId, b);
    });

    const matchedServerUrls = new Set<string>();
    const matchedAssetIds = new Set<string>();
    const grouped = new Map<string, StoredMediaEntry>();

    const registerRef = (
      url: string | undefined,
      assetId: string | undefined,
      kind: MediaKind,
      usage: MediaUsageRef
    ) => {
      const normalizedUrl = url?.trim() || '';
      const serverMatch =
        serverByUrl.get(normalizedUrl) ??
        (extractServerFilename(normalizedUrl)
          ? serverByFilename.get(extractServerFilename(normalizedUrl)!)
          : undefined);
      const blobMatch = assetId ? blobByAssetId.get(assetId) : undefined;

      if (!normalizedUrl && !blobMatch && !serverMatch) return;

      const canonicalKey = serverMatch
        ? `server:${serverMatch.url}`
        : assetId
          ? `asset:${assetId}`
          : `url:${normalizedUrl}`;

      if (serverMatch) matchedServerUrls.add(serverMatch.url);
      if (assetId) matchedAssetIds.add(assetId);

      const existing = grouped.get(canonicalKey);
      if (existing) {
        existing.usages.push(usage);
        return;
      }

      const previewUrl =
        serverMatch?.url ||
        (normalizedUrl && !normalizedUrl.startsWith('blob:') ? normalizedUrl : '') ||
        blobMatch?.objectUrl ||
        normalizedUrl;

      const resolvedSource: StoredMediaEntry['storageSource'] =
        serverMatch && blobMatch
          ? 'both'
          : serverMatch
            ? 'server'
            : blobMatch
              ? 'local'
              : 'external';

      grouped.set(canonicalKey, {
        key: canonicalKey,
        label:
          blobMatch?.name ||
          usage.label ||
          serverMatch?.filename ||
          deriveLabelFromUrl(previewUrl),
        previewUrl,
        serverUrl: serverMatch?.url,
        serverFilename: serverMatch?.filename || extractServerFilename(normalizedUrl),
        assetId,
        kind: serverMatch?.kind || blobMatch?.kind || kind,
        sizeBytes: serverMatch?.size ?? blobMatch?.size,
        createdAt: serverMatch?.createdAt ?? blobMatch?.lastModified,
        storageSource: resolvedSource,
        usages: [usage],
      });
    };

    state.promotions.forEach((promo, idx) => {
      registerRef(promo.mediaUrl, promo.mediaAssetId, promo.mediaKind, {
        sourceType: 'promotion',
        sourceId: promo.id,
        label: promo.title || `Promotion slide ${idx + 1}`,
        active: promo.active,
      });
    });

    state.menuItems.forEach((item) => {
      if (!item.mediaUrl && !item.mediaAssetId) return;
      registerRef(item.mediaUrl, item.mediaAssetId, 'image', {
        sourceType: 'menu',
        sourceId: item.id,
        label: item.name,
        active: item.available,
      });
    });

    state.specials.forEach((special) => {
      registerRef(special.mediaUrl, special.mediaAssetId, special.mediaKind, {
        sourceType: 'special',
        sourceId: special.id,
        label: special.title,
        active: special.active,
      });
    });

    // Unreferenced local browser blobs (old / orphaned uploads)
    localBlobs.forEach((blob) => {
      if (matchedAssetIds.has(blob.assetId)) return;
      const key = `asset:${blob.assetId}`;
      grouped.set(key, {
        key,
        label: blob.name || `Old upload (${blob.assetId.slice(0, 14)})`,
        previewUrl: blob.objectUrl,
        assetId: blob.assetId,
        kind: blob.kind,
        sizeBytes: blob.size,
        createdAt: blob.lastModified,
        storageSource: 'local',
        usages: [],
      });
    });

    // Unreferenced server media files (old / orphaned published files)
    serverFiles.forEach((file) => {
      if (matchedServerUrls.has(file.url)) return;
      const key = `server:${file.url}`;
      grouped.set(key, {
        key,
        label: file.filename,
        previewUrl: file.url,
        serverUrl: file.url,
        serverFilename: file.filename,
        kind: file.kind,
        sizeBytes: file.size,
        createdAt: file.createdAt,
        storageSource: 'server',
        usages: [],
      });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const timeDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (timeDiff !== 0) return timeDiff;
      return a.usages.length - b.usages.length;
    });
  }, [state.promotions, state.menuItems, state.specials, serverFiles, localBlobs]);

  const unusedEntries = useMemo(
    () => entries.filter((e) => e.usages.length === 0),
    [entries]
  );

  const usedCount = entries.length - unusedEntries.length;
  const totalBytes = useMemo(
    () => entries.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === 'unused' && entry.usages.length > 0) return false;
      if (filter === 'used' && entry.usages.length === 0) return false;
      if (filter === 'image' && entry.kind !== 'image') return false;
      if (filter === 'video' && entry.kind !== 'video') return false;
      if (!q) return true;
      return (
        entry.label.toLowerCase().includes(q) ||
        (entry.serverFilename?.toLowerCase().includes(q) ?? false) ||
        entry.usages.some(
          (u) =>
            u.label.toLowerCase().includes(q) || u.sourceType.toLowerCase().includes(q)
        )
      );
    });
  }, [entries, filter, searchQuery]);

  const handleConfirmDelete = async (entry: StoredMediaEntry) => {
    setBusyKey(entry.key);
    try {
      await onDeleteMedia(entry);
      setConfirmDeleteKey(null);
      await refreshInventory();
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmBulkUnused = async () => {
    if (unusedEntries.length === 0) return;
    setBulkBusy(true);
    try {
      await onDeleteUnusedMedia(unusedEntries);
      setConfirmBulkUnused(false);
      await refreshInventory();
    } finally {
      setBulkBusy(false);
    }
  };

  const getDeleteDescription = (entry: StoredMediaEntry): string => {
    if (entry.usages.length === 0) {
      return 'Permanently delete this unused media file?';
    }
    const promoCount = entry.usages.filter((u) => u.sourceType === 'promotion').length;
    const specialCount = entry.usages.filter((u) => u.sourceType === 'special').length;
    const menuCount = entry.usages.filter((u) => u.sourceType === 'menu').length;
    const parts: string[] = [];
    if (promoCount > 0) parts.push(`removes ${promoCount} promotion slide${promoCount > 1 ? 's' : ''}`);
    if (specialCount > 0) parts.push(`removes ${specialCount} daily special${specialCount > 1 ? 's' : ''}`);
    if (menuCount > 0) parts.push(`clears photo from ${menuCount} menu dish${menuCount > 1 ? 'es' : ''}`);
    return `In use: ${parts.join(', ')}. Delete anyway?`;
  };

  const getSourceTab = (sourceType: MediaUsageRef['sourceType']): DashboardTab => {
    if (sourceType === 'promotion') return 'promotions';
    if (sourceType === 'menu') return 'menu';
    return 'specials';
  };

  const getStorageLabel = (source: StoredMediaEntry['storageSource']): string => {
    if (source === 'both') return 'Server & Local';
    if (source === 'server') return 'Server upload';
    if (source === 'local') return 'Browser cache';
    return 'External URL';
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Stored Media</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            <span>{entries.length} stored</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{usedCount} in use</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className={unusedEntries.length > 0 ? 'text-amber-700 font-medium' : ''}>
              {unusedEntries.length} unused old
            </span>
            {totalBytes > 0 && (
              <>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{formatBytes(totalBytes)}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Grid view"
              aria-label="Grid view"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="List view"
              aria-label="List view"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void refreshInventory()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </button>

          {unusedEntries.length > 0 && !confirmBulkUnused && (
            <button
              type="button"
              onClick={() => setConfirmBulkUnused(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Delete Old ({unusedEntries.length})
            </button>
          )}
        </div>
      </div>

      {/* Inline Bulk Delete Confirmation */}
      {confirmBulkUnused && unusedEntries.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-red-800">
            <span className="font-semibold">
              Delete {unusedEntries.length} unused media file{unusedEntries.length > 1 ? 's' : ''}?
            </span>{' '}
            These files are not attached to any active promotion, menu item, or daily special.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmBulkUnused(false)}
              disabled={bulkBusy}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmBulkUnused()}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              {bulkBusy ? 'Deleting...' : 'Confirm Delete All'}
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by file name, promotion, or dish..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70">
          {(
            [
              { id: 'all', label: 'All', count: entries.length },
              { id: 'unused', label: 'Unused / Old', count: unusedEntries.length },
              { id: 'used', label: 'In Use', count: usedCount },
              {
                id: 'image',
                label: 'Images',
                count: entries.filter((e) => e.kind === 'image').length,
              },
              {
                id: 'video',
                label: 'Videos',
                count: entries.filter((e) => e.kind === 'video').length,
              },
            ] as { id: MediaFilter; label: string; count: number }[]
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && entries.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-white p-3 space-y-3 animate-pulse"
            >
              <div className="aspect-video rounded-lg bg-slate-200" />
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <HardDrive className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-900">
            {entries.length === 0
              ? 'No stored media found'
              : filter === 'unused'
                ? 'No unused old media'
                : 'No media matches your filter'}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {filter === 'unused'
              ? 'All stored images and videos are currently active across your promotions, menu, or daily specials.'
              : 'Images and videos uploaded to Promotions, Menu items, or Daily Specials appear here for review and cleanup.'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* Large-screen compact list view (automatically adapts on smaller screens too) */
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
          {filteredEntries.map((entry) => {
            const isConfirming = confirmDeleteKey === entry.key;
            const isBusy = busyKey === entry.key;
            const isUnused = entry.usages.length === 0;
            const dateStr = formatDateShort(entry.createdAt);

            return (
              <div key={entry.key} className="p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => setLightboxEntry(entry)}
                    className="relative w-full sm:w-28 aspect-video sm:aspect-[16/10] rounded-lg overflow-hidden bg-slate-950 border border-slate-200 shrink-0 group flex items-center justify-center"
                    aria-label={`Preview ${entry.label}`}
                  >
                    <MediaAsset
                      src={entry.previewUrl}
                      kind={entry.kind}
                      alt={entry.label}
                      fit="contain"
                      autoPlay={false}
                    />
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-950/75 p-1 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="w-3 h-3" aria-hidden="true" />
                    </span>
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {entry.label}
                      </p>
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          isUnused ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {isUnused ? 'Unused' : 'In Use'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 mt-1 tabular-nums">
                      <span>{entry.kind === 'video' ? 'Video' : 'Image'}</span>
                      {entry.sizeBytes !== undefined && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{formatBytes(entry.sizeBytes)}</span>
                        </>
                      )}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{getStorageLabel(entry.storageSource)}</span>
                      {dateStr && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{dateStr}</span>
                        </>
                      )}
                    </div>

                    {entry.usages.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {entry.usages.map((usage) => (
                          <button
                            key={`${usage.sourceType}-${usage.sourceId}`}
                            type="button"
                            onClick={() => onNavigateTab(getSourceTab(usage.sourceType))}
                            className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-amber-700 hover:underline min-w-0 max-w-full"
                          >
                            <span className="capitalize text-slate-400">{usage.sourceType}:</span>
                            <span className="truncate max-w-[180px]">{usage.label}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isConfirming && (
                    <div className="flex items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(entry.key)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 whitespace-nowrap shrink-0 w-full sm:w-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {isConfirming && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <p className="text-xs text-red-800">{getDeleteDescription(entry)}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(null)}
                        disabled={isBusy}
                        className="flex-1 sm:flex-none rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmDelete(entry)}
                        disabled={isBusy}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap disabled:opacity-60"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        {isBusy ? 'Deleting...' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Responsive Gallery Grid: 1-col on small screens, 2-col on sm+ screens */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => {
            const isConfirming = confirmDeleteKey === entry.key;
            const isBusy = busyKey === entry.key;
            const isUnused = entry.usages.length === 0;
            const dateStr = formatDateShort(entry.createdAt);

            return (
              <div
                key={entry.key}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-video bg-slate-950 border-b border-slate-200 flex items-center justify-center overflow-hidden group">
                    <MediaAsset
                      src={entry.previewUrl}
                      kind={entry.kind}
                      alt={entry.label}
                      fit="contain"
                      autoPlay={false}
                    />
                    <button
                      type="button"
                      onClick={() => setLightboxEntry(entry)}
                      aria-label={`Inspect ${entry.label}`}
                      className="absolute top-2 right-2 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-950/75 text-white hover:bg-slate-950 transition-colors"
                    >
                      <Maximize2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {entry.label}
                      </h3>
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          isUnused ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {isUnused ? 'Unused' : 'In Use'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {entry.kind === 'video' ? (
                          <Film className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <ImageIcon className="w-3 h-3" aria-hidden="true" />
                        )}
                        {entry.kind === 'video' ? 'Video' : 'Image'}
                      </span>
                      {entry.sizeBytes !== undefined && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{formatBytes(entry.sizeBytes)}</span>
                        </>
                      )}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{getStorageLabel(entry.storageSource)}</span>
                      {dateStr && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{dateStr}</span>
                        </>
                      )}
                    </div>

                    {entry.usages.length > 0 ? (
                      <div className="pt-1 space-y-1">
                        {entry.usages.map((usage) => (
                          <button
                            key={`${usage.sourceType}-${usage.sourceId}`}
                            type="button"
                            onClick={() => onNavigateTab(getSourceTab(usage.sourceType))}
                            className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-amber-700 hover:underline w-full text-left min-w-0"
                          >
                            <span className="capitalize text-slate-400 shrink-0">
                              {usage.sourceType}:
                            </span>
                            <span className="truncate">{usage.label}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 pt-1">
                        Not attached to any active slide, dish, or special.
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-3.5 pb-3.5 pt-1">
                  {isConfirming ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-2">
                      <p className="text-xs text-red-800">{getDeleteDescription(entry)}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(null)}
                          disabled={isBusy}
                          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleConfirmDelete(entry)}
                          disabled={isBusy}
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap disabled:opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          {isBusy ? 'Deleting...' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteKey(entry.key)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete Media
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Screen Preview Lightbox */}
      {lightboxEntry && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxEntry(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-slate-800">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {lightboxEntry.label}
                </p>
                <p className="text-xs text-slate-400 tabular-nums">
                  {lightboxEntry.kind === 'video' ? 'Video' : 'Image'}
                  {lightboxEntry.sizeBytes !== undefined && (
                    <>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {formatBytes(lightboxEntry.sizeBytes)}
                    </>
                  )}
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  {getStorageLabel(lightboxEntry.storageSource)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxEntry(null)}
                aria-label="Close media preview"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black flex items-center justify-center max-h-[70vh] aspect-video">
              <MediaAsset
                src={lightboxEntry.previewUrl}
                kind={lightboxEntry.kind}
                alt={lightboxEntry.label}
                fit="contain"
                controls={lightboxEntry.kind === 'video'}
              />
            </div>

            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                {lightboxEntry.usages.length > 0
                  ? `Used in ${lightboxEntry.usages.length} item${lightboxEntry.usages.length > 1 ? 's' : ''}`
                  : 'Unused stored media'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const target = lightboxEntry;
                  setLightboxEntry(null);
                  setConfirmDeleteKey(target.key);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/60 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/60 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Delete Media
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
