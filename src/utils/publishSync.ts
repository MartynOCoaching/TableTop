import { AdminNetworkAd, PortalState } from '../types';
import { getMediaBlob } from './storage';

export const SYNC_CHANNEL_NAME = 'tabletop_studio_sync_v1';

export interface PublishedPayload {
  state: PortalState;
  version: number;
  networkAds?: AdminNetworkAd[];
}

async function uploadBlobToServer(blob: Blob): Promise<string | null> {
  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Ensures any locally dropped/uploaded `blob:` URLs in IndexedDB are uploaded
 * to the server so `/emulator` across any browser or device renders them reliably.
 */
export async function resolvePublishableMedia(state: PortalState): Promise<PortalState> {
  const uploadedCache = new Map<string, string>();

  const resolveItemUrl = async (
    url: string | undefined,
    assetId: string | undefined
  ): Promise<string | undefined> => {
    if (url && !url.startsWith('blob:')) return url;
    if (!assetId) return url;
    const cached = uploadedCache.get(assetId);
    if (cached) return cached;

    const blob = await getMediaBlob(assetId);
    if (!blob) return url;
    const serverUrl = await uploadBlobToServer(blob);
    if (serverUrl) {
      uploadedCache.set(assetId, serverUrl);
      return serverUrl;
    }
    return url;
  };

  const promotions = await Promise.all(
    state.promotions.map(async (promo) => {
      const resolvedUrl = await resolveItemUrl(promo.mediaUrl, promo.mediaAssetId);
      return resolvedUrl ? { ...promo, mediaUrl: resolvedUrl } : promo;
    })
  );

  const menuItems = await Promise.all(
    state.menuItems.map(async (item) => {
      const resolvedUrl = await resolveItemUrl(item.mediaUrl, item.mediaAssetId);
      return { ...item, mediaUrl: resolvedUrl };
    })
  );

  const specials = await Promise.all(
    state.specials.map(async (special) => {
      const resolvedUrl = await resolveItemUrl(special.mediaUrl, special.mediaAssetId);
      return resolvedUrl ? { ...special, mediaUrl: resolvedUrl } : special;
    })
  );

  return {
    ...state,
    promotions,
    menuItems,
    specials,
  };
}

export async function publishPortalState(
  draftState: PortalState
): Promise<{
  resolvedState: PortalState;
  lastPublishedAt: string;
  version: number;
  connectedDisplays: number;
}> {
  const resolvedState = await resolvePublishableMedia(draftState);

  const res = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: resolvedState }),
  });

  if (!res.ok) {
    throw new Error('Failed to publish changes to connected devices');
  }

  const data = (await res.json()) as {
    lastPublishedAt: string;
    version: number;
    connectedDisplays: number;
  };

  const finalizedState: PortalState = {
    ...resolvedState,
    venue: {
      ...resolvedState.venue,
      lastPublishedAt: data.lastPublishedAt,
    },
  };

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    channel.postMessage({
      type: 'published',
      state: finalizedState,
      version: data.version,
    });
    channel.close();
  }

  return {
    resolvedState: finalizedState,
    lastPublishedAt: data.lastPublishedAt,
    version: data.version,
    connectedDisplays: data.connectedDisplays ?? 0,
  };
}

export async function fetchPublishedState(): Promise<PublishedPayload | null> {
  try {
    const res = await fetch('/api/emulator/state', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as PublishedPayload;
  } catch {
    return null;
  }
}

export async function resetPublishedStateOnServer(): Promise<void> {
  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch {
    // Ignore if offline
  }
}
