import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { AdminNetworkAd, AdTargetScope, MediaKind } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrors';
import { getMediaBlob } from '../utils/storage';
import { sanitizeFirestoreId, slugifyClientId } from './clientTablesService';

export function isStockNetworkAd(ad: Partial<AdminNetworkAd>): boolean {
  const url = (ad.mediaUrl ?? '').trim();
  return ad.id === 'net-ad-1' || ad.id === 'net-ad-2' || url.startsWith('/src/assets/images/');
}

export interface NetworkAdInput {
  sponsorName: string;
  headline: string;
  bodyCopy: string;
  mediaUrl: string;
  mediaKind: MediaKind;
  durationSec: number;
  categoryTag: string;
  active: boolean;
  targetScope: AdTargetScope;
  targetClientIds: string[];
  mediaAssetId?: string;
}

function toMillis(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof ts === 'object' && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

function normalizeAdUrl(url: string): string {
  const trimmed = (url ?? '').trim();
  if (trimmed.startsWith('data:') && trimmed.length > 1000) {
    throw new Error('Image data is too large. Please upload a PNG, JPG, WebP, or MP4 file.');
  }
  return trimmed.slice(0, 1000);
}

async function resolveServerMediaUrl(
  mediaUrl: string,
  mediaAssetId?: string
): Promise<string> {
  if (mediaUrl && !mediaUrl.startsWith('blob:')) {
    return normalizeAdUrl(mediaUrl);
  }
  if (!mediaAssetId) {
    throw new Error('Media asset could not be resolved for upload.');
  }
  const blob = await getMediaBlob(mediaAssetId);
  if (!blob) {
    throw new Error('Uploaded file could not be read from browser storage.');
  }
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  });
  if (!res.ok) {
    throw new Error('Failed to upload sponsored ad media to server.');
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new Error('Server did not return a valid media URL.');
  }
  return data.url;
}

export function sanitizeNetworkAdPayload(
  input: NetworkAdInput,
  resolvedMediaUrl: string
): Omit<AdminNetworkAd, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'> {
  const targetClientIds = Array.from(
    new Set(
      (input.targetClientIds ?? [])
        .map((id) => sanitizeFirestoreId(id, 'client'))
        .filter(Boolean)
    )
  ).slice(0, 100);

  return {
    sponsorName: (input.sponsorName ?? '').trim().slice(0, 120),
    headline: (input.headline ?? '').trim().slice(0, 140),
    bodyCopy: (input.bodyCopy ?? '').trim().slice(0, 400),
    mediaUrl: resolvedMediaUrl.slice(0, 1000),
    mediaKind: input.mediaKind === 'video' ? 'video' : 'image',
    durationSec: Math.max(1, Math.min(120, Math.round(Number(input.durationSec) || 10))),
    categoryTag: (input.categoryTag ?? '').trim().slice(0, 80),
    active: Boolean(input.active),
    targetScope: input.targetScope === 'selected' ? 'selected' : 'all',
    targetClientIds,
  };
}

export function subscribeAdminNetworkAds(
  uid: string,
  isBootstrapAdmin: boolean,
  onData: (ads: AdminNetworkAd[]) => void,
  onError: (err: Error) => void
): () => void {
  const colRef = collection(db, 'networkAds');
  const q = isBootstrapAdmin ? query(colRef) : query(colRef, where('createdByUid', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: AdminNetworkAd[] = snapshot.docs.map((d) => {
        const data = d.data() as AdminNetworkAd;
        return {
          ...data,
          id: data.id || d.id,
          active: data.active ?? true,
          targetScope: data.targetScope ?? 'all',
          targetClientIds: Array.isArray(data.targetClientIds) ? data.targetClientIds : [],
        };
      });
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'networkAds');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeActiveNetworkAds(
  onData: (ads: AdminNetworkAd[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, 'networkAds');
  const q = query(colRef, where('active', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: AdminNetworkAd[] = snapshot.docs
        .map((d) => {
          const data = d.data() as AdminNetworkAd;
          return {
            ...data,
            id: data.id || d.id,
            active: true,
            targetScope: data.targetScope ?? 'all',
            targetClientIds: Array.isArray(data.targetClientIds) ? data.targetClientIds : [],
          };
        })
        .filter((ad) => !isStockNetworkAd(ad));
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(rows);
    },
    (error) => {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  );
}

export async function createNetworkAd(
  uid: string,
  input: NetworkAdInput,
  customId?: string
): Promise<string> {
  const adId = sanitizeFirestoreId(
    customId || `net_ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    'net_ad'
  );
  const resolvedUrl = await resolveServerMediaUrl(input.mediaUrl, input.mediaAssetId);
  const payload = sanitizeNetworkAdPayload(input, resolvedUrl);
  const path = `networkAds/${adId}`;

  try {
    await setDoc(doc(db, 'networkAds', adId), {
      id: adId,
      ...payload,
      createdByUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return adId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateNetworkAd(
  adId: string,
  input: NetworkAdInput
): Promise<void> {
  const cleanId = sanitizeFirestoreId(adId, 'net_ad');
  const resolvedUrl = await resolveServerMediaUrl(input.mediaUrl, input.mediaAssetId);
  const payload = sanitizeNetworkAdPayload(input, resolvedUrl);
  const path = `networkAds/${cleanId}`;

  try {
    await updateDoc(doc(db, 'networkAds', cleanId), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNetworkAd(adId: string): Promise<void> {
  const cleanId = sanitizeFirestoreId(adId, 'net_ad');
  const path = `networkAds/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'networkAds', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function serializeNetworkAdsForServer(ads: AdminNetworkAd[]): AdminNetworkAd[] {
  return ads
    .filter((ad) => !isStockNetworkAd(ad))
    .map((ad) => ({
    id: ad.id,
    sponsorName: ad.sponsorName ?? '',
    headline: ad.headline ?? '',
    bodyCopy: ad.bodyCopy ?? '',
    mediaUrl: ad.mediaUrl,
    mediaKind: ad.mediaKind === 'video' ? 'video' : 'image',
    durationSec: Math.max(1, Math.min(120, Number(ad.durationSec) || 10)),
    categoryTag: ad.categoryTag ?? '',
    active: ad.active !== false,
    targetScope: ad.targetScope === 'selected' ? 'selected' : 'all',
    targetClientIds: Array.isArray(ad.targetClientIds) ? ad.targetClientIds : [],
  }));
}

export async function syncNetworkAdsToServer(ads: AdminNetworkAd[]): Promise<void> {
  try {
    await fetch('/api/network-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads: serializeNetworkAdsForServer(ads) }),
    });
  } catch {
    // Ignore transient offline sync errors
  }
}

export async function fetchServerNetworkAds(): Promise<AdminNetworkAd[] | null> {
  try {
    const res = await fetch('/api/network-ads', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { ads?: AdminNetworkAd[] };
    return Array.isArray(data.ads) ? data.ads.filter((ad) => !isStockNetworkAd(ad)) : null;
  } catch {
    return null;
  }
}

export function filterNetworkAdsForClient(
  ads: AdminNetworkAd[],
  clientId?: string | null,
  venueName?: string
): AdminNetworkAd[] {
  const candidateIds = new Set<string>();
  if (clientId) {
    candidateIds.add(clientId);
    candidateIds.add(sanitizeFirestoreId(clientId, 'client'));
  }
  if (venueName) {
    candidateIds.add(slugifyClientId(venueName));
  }

  return ads.filter((ad) => {
    if (isStockNetworkAd(ad)) return false;
    if (ad.active === false) return false;
    if (ad.targetScope !== 'selected') return true;
    if (candidateIds.size === 0) return false;
    const targets = ad.targetClientIds ?? [];
    return targets.some((targetId) => candidateIds.has(targetId));
  });
}
