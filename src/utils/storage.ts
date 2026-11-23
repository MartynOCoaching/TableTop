import { PortalState } from '../types';
import { SEED_PORTAL_STATE, stripLegacyMockPortalState } from '../data/seedData';
import { buildDefaultDevices } from './devices';

const STORAGE_KEY = 'tabletop_studio_portal_v1';
const DB_NAME = 'tabletop_studio_media_db';
const STORE_NAME = 'media_blobs';

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMediaFile(file: File): Promise<{ assetId: string; objectUrl: string }> {
  const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const objectUrl = URL.createObjectURL(file);

  try {
    const db = await openMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(file, assetId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback gracefully to in-memory object URL if IndexedDB is blocked
  }

  return { assetId, objectUrl };
}

export async function getMediaBlob(assetId: string): Promise<Blob | null> {
  try {
    const db = await openMediaDB();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(assetId);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    return blob ?? null;
  } catch {
    return null;
  }
}

export async function loadMediaObjectUrl(assetId: string): Promise<string | null> {
  const blob = await getMediaBlob(assetId);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return null;
}

export interface StoredMediaBlobEntry {
  assetId: string;
  kind: 'image' | 'video';
  size: number;
  mimeType: string;
  name?: string;
  lastModified?: number;
  objectUrl: string;
}

export async function listStoredMediaBlobs(): Promise<StoredMediaBlobEntry[]> {
  try {
    const db = await openMediaDB();
    return await new Promise<StoredMediaBlobEntry[]>((resolve, reject) => {
      const entries: StoredMediaBlobEntry[] = [];
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(entries);
          return;
        }
        const assetId = String(cursor.key);
        const value = cursor.value as Blob | File | undefined;
        if (value instanceof Blob) {
          const mimeType = value.type || 'application/octet-stream';
          const isVideo = mimeType.startsWith('video/');
          const maybeFile = value as Partial<File>;
          entries.push({
            assetId,
            kind: isVideo ? 'video' : 'image',
            size: value.size,
            mimeType,
            name: typeof maybeFile.name === 'string' ? maybeFile.name : undefined,
            lastModified:
              typeof maybeFile.lastModified === 'number' ? maybeFile.lastModified : undefined,
            objectUrl: URL.createObjectURL(value),
          });
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteMediaBlob(assetId: string): Promise<void> {
  if (!assetId) return;
  try {
    const db = await openMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(assetId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore deletion errors if IndexedDB unavailable
  }
}

export async function hydratePortalMedia(state: PortalState): Promise<PortalState> {
  const nextPromotions = await Promise.all(
    state.promotions.map(async (promo) => {
      if (!promo.mediaAssetId) return promo;
      const restoredUrl = await loadMediaObjectUrl(promo.mediaAssetId);
      return restoredUrl ? { ...promo, mediaUrl: restoredUrl } : promo;
    })
  );

  const nextMenuItems = await Promise.all(
    state.menuItems.map(async (item) => {
      if (!item.mediaAssetId) return item;
      const restoredUrl = await loadMediaObjectUrl(item.mediaAssetId);
      return restoredUrl ? { ...item, mediaUrl: restoredUrl } : item;
    })
  );

  const nextSpecials = await Promise.all(
    state.specials.map(async (special) => {
      if (!special.mediaAssetId) return special;
      const restoredUrl = await loadMediaObjectUrl(special.mediaAssetId);
      return restoredUrl ? { ...special, mediaUrl: restoredUrl } : special;
    })
  );

  return {
    ...state,
    promotions: nextPromotions,
    menuItems: nextMenuItems,
    specials: nextSpecials,
  };
}

export function hasSavedPortalState(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function loadPortalState(): PortalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_PORTAL_STATE;
    const parsed = JSON.parse(raw) as Partial<PortalState>;
    const venue = { ...SEED_PORTAL_STATE.venue, ...(parsed.venue ?? {}) };
    const devices = Array.isArray(parsed.devices)
      ? parsed.devices
      : buildDefaultDevices(venue.unitCount);
    const assembled: PortalState = {
      venue,
      devices,
      promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : SEED_PORTAL_STATE.categories,
      menuItems: Array.isArray(parsed.menuItems) ? parsed.menuItems : [],
      specials: Array.isArray(parsed.specials) ? parsed.specials : [],
      adMonetization: {
        ...SEED_PORTAL_STATE.adMonetization,
        ...(parsed.adMonetization ?? {}),
      },
    };
    const cleaned = stripLegacyMockPortalState(assembled);
    if (
      cleaned.promotions.length !== assembled.promotions.length ||
      cleaned.menuItems.length !== assembled.menuItems.length ||
      cleaned.specials.length !== assembled.specials.length
    ) {
      savePortalState(cleaned);
    }
    return cleaned;
  } catch {
    return SEED_PORTAL_STATE;
  }
}

export function savePortalState(state: PortalState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export async function clearAllPortalStorage(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
    const db = await openMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore errors
  }
}
