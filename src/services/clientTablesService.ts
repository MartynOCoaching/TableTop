import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ClientAccount,
  ClientAccountStatus,
  ClientPortalTablesBundle,
  DailySpecial,
  DailySpecialRecord,
  DeviceScreenRecord,
  MediaAssetRecord,
  MediaKind,
  MenuCategory,
  MenuCategoryRecord,
  MenuItem,
  MenuItemRecord,
  PortalState,
  PromotionItem,
  PromotionRecord,
  TabletopDevice,
} from '../types';
import { deleteDoc } from 'firebase/firestore';
import {
  isStockAssetUrl,
  MOCK_MENU_ITEM_IDS,
  MOCK_PROMOTION_IDS,
  MOCK_SPECIAL_IDS,
} from '../data/seedData';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrors';
import { buildDefaultDevices } from '../utils/devices';
import { resolvePublishableMedia } from '../utils/publishSync';
import { computeClientBilling } from './superAdminService';

const SUBCOLLECTIONS = [
  'devices',
  'promotions',
  'menuCategories',
  'menuItems',
  'specials',
  'mediaAssets',
] as const;

export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  if (!cleaned) {
    return `${fallbackPrefix}_${Date.now()}`;
  }
  return cleaned;
}

export function slugifyClientId(businessName: string): string {
  const slug = businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return slug ? `client_${slug}` : `client_${Date.now()}`;
}

function clampString(value: string | undefined | null, maxLen: number): string {
  return (value ?? '').toString().trim().slice(0, maxLen);
}

function clampUrl(value: string | undefined | null, maxLen = 1000): string {
  const trimmed = (value ?? '').toString().trim();
  if (trimmed.length <= maxLen) return trimmed;
  // Data URLs exceeding 1000 chars cannot be stored in Firestore string fields
  if (trimmed.startsWith('data:')) return '';
  return trimmed.slice(0, maxLen);
}

function clampNumber(value: unknown, min: number, max: number, roundInt = false): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  const bounded = Math.max(min, Math.min(max, num));
  return roundInt ? Math.round(bounded) : Math.round(bounded * 100) / 100;
}

function toMillis(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof ts === 'object' && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

function buildMediaAssetsFromRecords(params: {
  clientId: string;
  uid: string;
  contactEmail: string;
  promotions: Omit<PromotionRecord, 'createdAt' | 'updatedAt'>[];
  menuItems: Omit<MenuItemRecord, 'createdAt' | 'updatedAt'>[];
  specials: Omit<DailySpecialRecord, 'createdAt' | 'updatedAt'>[];
}): Omit<MediaAssetRecord, 'createdAt' | 'updatedAt'>[] {
  const { clientId, uid, contactEmail, promotions, menuItems, specials } = params;
  const assets: Omit<MediaAssetRecord, 'createdAt' | 'updatedAt'>[] = [];
  const usedIds = new Set<string>();

  const pushAsset = (entry: {
    rawAssetId: string;
    url: string;
    kind: MediaKind;
    sourceType: 'promotion' | 'menu' | 'special';
    sourceId: string;
    label: string;
  }) => {
    if (!entry.url || entry.url.length > 1000) return;
    let candidateId = sanitizeFirestoreId(
      entry.rawAssetId || `media_${entry.sourceType}_${entry.sourceId}`,
      'media'
    );
    if (usedIds.has(candidateId)) {
      candidateId = sanitizeFirestoreId(`${candidateId}_${entry.sourceType}_${entry.sourceId}`, 'media');
    }
    if (usedIds.has(candidateId)) return;
    usedIds.add(candidateId);

    assets.push({
      id: candidateId,
      clientId,
      createdByUid: uid,
      clientContactEmail: contactEmail,
      url: entry.url,
      kind: entry.kind,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      label: clampString(entry.label, 140) || `${entry.sourceType} media`,
    });
  };

  for (const promo of promotions) {
    pushAsset({
      rawAssetId: promo.mediaAssetId || `promo_media_${promo.id}`,
      url: promo.mediaUrl,
      kind: promo.mediaKind,
      sourceType: 'promotion',
      sourceId: promo.id,
      label: promo.title || promo.scheduleLabel || 'Promotion Slide',
    });
  }

  for (const item of menuItems) {
    pushAsset({
      rawAssetId: item.mediaAssetId || `menu_media_${item.id}`,
      url: item.mediaUrl,
      kind: 'image',
      sourceType: 'menu',
      sourceId: item.id,
      label: item.name,
    });
  }

  for (const special of specials) {
    pushAsset({
      rawAssetId: special.mediaAssetId || `special_media_${special.id}`,
      url: special.mediaUrl,
      kind: special.mediaKind,
      sourceType: 'special',
      sourceId: special.id,
      label: special.title,
    });
  }

  return assets;
}

async function syncSubcollectionDocs<T extends { id: string }>(params: {
  clientId: string;
  subcollectionName: (typeof SUBCOLLECTIONS)[number];
  uid: string;
  userEmail: string;
  isBootstrapAdmin: boolean;
  canListAny: boolean;
  existingIdsQueryMode: 'admin-all' | 'createdBy' | 'contactEmail';
  records: T[];
  stripImmutableForUpdate: (record: T) => Record<string, unknown>;
}): Promise<void> {
  const {
    clientId,
    subcollectionName,
    uid,
    userEmail,
    existingIdsQueryMode,
    records,
    stripImmutableForUpdate,
  } = params;

  const colPath = `clientAccounts/${clientId}/${subcollectionName}`;
  const colRef = collection(db, 'clientAccounts', clientId, subcollectionName);

  const q =
    existingIdsQueryMode === 'admin-all'
      ? query(colRef)
      : existingIdsQueryMode === 'contactEmail'
        ? query(colRef, where('clientContactEmail', '==', userEmail))
        : query(colRef, where('createdByUid', '==', uid));

  const existingIds = new Set<string>();
  try {
    const snap = await getDocs(q);
    snap.forEach((d) => existingIds.add(d.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, colPath);
  }

  const nextIds = new Set(records.map((r) => r.id));
  type BatchOp =
    | { type: 'set'; id: string; data: Record<string, unknown> }
    | { type: 'update'; id: string; data: Record<string, unknown> }
    | { type: 'delete'; id: string };

  const ops: BatchOp[] = [];

  for (const record of records) {
    if (existingIds.has(record.id)) {
      ops.push({
        type: 'update',
        id: record.id,
        data: {
          ...stripImmutableForUpdate(record),
          updatedAt: serverTimestamp(),
        },
      });
    } else {
      ops.push({
        type: 'set',
        id: record.id,
        data: {
          ...record,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  for (const oldId of existingIds) {
    if (!nextIds.has(oldId)) {
      ops.push({ type: 'delete', id: oldId });
    }
  }

  // Commit in chunks of 400 to respect Firestore's 500-op batch limit
  for (let i = 0; i < ops.length; i += 400) {
    const chunk = ops.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, 'clientAccounts', clientId, subcollectionName, op.id);
      if (op.type === 'set') {
        batch.set(ref, op.data);
      } else if (op.type === 'update') {
        batch.update(ref, op.data);
      } else {
        batch.delete(ref);
      }
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, colPath);
    }
  }
}

export interface SyncClientTablesParams {
  uid: string;
  userEmail: string;
  isAdmin: boolean;
  isBootstrapAdmin: boolean;
  clientId?: string;
  contactEmail?: string;
  status?: ClientAccountStatus;
  portalState: PortalState;
  preserveExistingBilling?: boolean;
}

export async function syncClientTablesToFirestore(
  params: SyncClientTablesParams
): Promise<{
  clientId: string;
  resolvedPortalState: PortalState;
  counts: {
    promotions: number;
    categories: number;
    menuItems: number;
    specials: number;
    mediaAssets: number;
  };
}> {
  const { uid, isAdmin, isBootstrapAdmin, preserveExistingBilling = false } = params;
  const userEmail = params.userEmail.trim().toLowerCase().slice(0, 200);
  const resolvedPortalState = await resolvePublishableMedia(params.portalState);

  const businessName =
    clampString(resolvedPortalState.venue.name, 120) || 'Untitled Venue';
  const clientId = sanitizeFirestoreId(
    params.clientId || slugifyClientId(businessName),
    'client'
  );
  const clientPath = `clientAccounts/${clientId}`;
  const clientRef = doc(db, 'clientAccounts', clientId);

  let existingClient: ClientAccount | null = null;
  try {
    const snap = await getDoc(clientRef);
    if (snap.exists()) {
      existingClient = snap.data() as ClientAccount;
    }
  } catch (err) {
    // Non-admin might not have read permission if checking a fresh slug; ignore not-found vs real errors carefully
    const code = (err as { code?: string })?.code;
    if (code !== 'permission-denied') {
      handleFirestoreError(err, OperationType.GET, clientPath);
    }
  }

  const effectiveContactEmail = clampString(
    params.contactEmail ?? existingClient?.contactEmail ?? userEmail,
    200
  ).toLowerCase();

  const shouldPreserveBilling = Boolean(existingClient && preserveExistingBilling);

  const unitCount = shouldPreserveBilling
    ? existingClient!.activeUnits
    : clampNumber(resolvedPortalState.venue.unitCount, 0, 5000, true);
  const baseFeePerUnit = clampNumber(
    resolvedPortalState.venue.monthlyBaseFeePerUnit ??
      existingClient?.monthlyBaseFeePerUnit ??
      15,
    0,
    10000
  );
  const creditPerUnitMonthly = shouldPreserveBilling
    ? existingClient!.creditPerUnitMonthly
    : clampNumber(
        resolvedPortalState.adMonetization.creditPerUnitMonthly ??
          existingClient?.creditPerUnitMonthly ??
          1,
        0,
        1000
      );
  const adProgramOptedIn = shouldPreserveBilling
    ? existingClient!.adProgramOptedIn
    : Boolean(resolvedPortalState.adMonetization.optedIn);

  const computedSubFee =
    existingClient && (!isAdmin || shouldPreserveBilling)
      ? existingClient.monthlySubscriptionFee
      : clampNumber(unitCount * baseFeePerUnit, 0, 1_000_000);

  const effectiveCreditPerUnit =
    existingClient && (!isAdmin || shouldPreserveBilling)
      ? existingClient.creditPerUnitMonthly
      : creditPerUnitMonthly;

  const billing = computeClientBilling({
    activeUnits: unitCount,
    monthlySubscriptionFee: computedSubFee,
    adProgramOptedIn,
    creditPerUnitMonthly: effectiveCreditPerUnit,
  });

  const tagline = clampString(
    resolvedPortalState.venue.tagline || existingClient?.tagline,
    160
  );
  const accentTheme =
    resolvedPortalState.venue.accentTheme || existingClient?.accentTheme || 'amber';
  const rotationRatioLabel = clampString(
    resolvedPortalState.adMonetization.rotationRatioLabel ||
      existingClient?.rotationRatioLabel ||
      '1 partner slot per 3 venue promos',
    120
  );
  const adActiveSince = clampString(
    resolvedPortalState.adMonetization.activeSince || existingClient?.adActiveSince,
    60
  );
  const lastPublishedAt = clampString(
    resolvedPortalState.venue.lastPublishedAt ||
      existingClient?.lastPublishedAt ||
      new Date().toISOString(),
    60
  );
  const effectiveStatus: ClientAccountStatus =
    params.status ?? existingClient?.status ?? 'active';

  // Step 1: Write parent clientAccounts/{clientId} FIRST so exists() succeeds in subcollection rules
  if (!existingClient) {
    try {
      await setDoc(clientRef, {
        id: clientId,
        businessName,
        tagline,
        contactEmail: effectiveContactEmail,
        ownerUid: isAdmin ? '' : uid,
        accentTheme,
        status: isAdmin ? effectiveStatus : 'active',
        activeUnits: billing.activeUnits,
        monthlyBaseFeePerUnit: baseFeePerUnit,
        monthlySubscriptionFee: billing.monthlySubscriptionFee,
        monthlyCredit: billing.monthlyCredit,
        totalMonthlyBill: billing.totalMonthlyBill,
        adProgramOptedIn,
        creditPerUnitMonthly: billing.creditPerUnitMonthly,
        rotationRatioLabel,
        adActiveSince,
        lastPublishedAt,
        createdByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, clientPath);
    }
  } else if (isAdmin) {
    try {
      await updateDoc(clientRef, {
        businessName: shouldPreserveBilling ? existingClient.businessName : businessName,
        tagline,
        contactEmail: effectiveContactEmail,
        accentTheme,
        status: effectiveStatus,
        activeUnits: billing.activeUnits,
        monthlyBaseFeePerUnit: baseFeePerUnit,
        monthlySubscriptionFee: billing.monthlySubscriptionFee,
        monthlyCredit: billing.monthlyCredit,
        totalMonthlyBill: billing.totalMonthlyBill,
        adProgramOptedIn,
        creditPerUnitMonthly: billing.creditPerUnitMonthly,
        rotationRatioLabel,
        adActiveSince,
        lastPublishedAt,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, clientPath);
    }
  } else {
    // Client owner allowed fields only (cannot modify monthlySubscriptionFee or creditPerUnitMonthly)
    try {
      await updateDoc(clientRef, {
        businessName,
        tagline,
        accentTheme,
        activeUnits: billing.activeUnits,
        monthlyCredit: billing.monthlyCredit,
        totalMonthlyBill: billing.totalMonthlyBill,
        adProgramOptedIn,
        lastPublishedAt,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, clientPath);
    }
  }

  // Step 2: Prepare normalized subcollection records
  const promotions: Omit<PromotionRecord, 'createdAt' | 'updatedAt'>[] =
    resolvedPortalState.promotions.map((promo, index) => ({
      id: sanitizeFirestoreId(promo.id, `promo_${index + 1}`),
      clientId,
      createdByUid: uid,
      clientContactEmail: effectiveContactEmail,
      sortOrder: Math.min(1000, index),
      title: clampString(promo.title, 140),
      scheduleLabel: clampString(promo.scheduleLabel, 140),
      subtitle: clampString(promo.subtitle, 400),
      ctaLabel: clampString(promo.ctaLabel, 60),
      durationSec: clampNumber(promo.durationSec, 1, 300, true),
      mediaUrl: clampUrl(promo.mediaUrl, 1000),
      mediaKind: promo.mediaKind === 'video' ? 'video' : 'image',
      mediaAssetId: sanitizeFirestoreId(
        promo.mediaAssetId || `asset_promo_${promo.id}`,
        'asset'
      ),
      active: Boolean(promo.active),
      scheduleMode: promo.schedule?.mode === 'scheduled' ? 'scheduled' : 'always',
      startDate: clampString(promo.schedule?.startDate, 20),
      endDate: clampString(promo.schedule?.endDate, 20),
      startTime: clampString(promo.schedule?.startTime, 10),
      endTime: clampString(promo.schedule?.endTime, 10),
    }));

  const categories: Omit<MenuCategoryRecord, 'createdAt' | 'updatedAt'>[] =
    resolvedPortalState.categories.map((cat, index) => ({
      id: sanitizeFirestoreId(cat.id, `cat_${index + 1}`),
      clientId,
      createdByUid: uid,
      clientContactEmail: effectiveContactEmail,
      name: clampString(cat.name, 80) || `Category ${index + 1}`,
      sortOrder: Math.min(500, index),
    }));

  const categoryNameById = new Map<string, string>(
    categories.map((cat) => [cat.id, cat.name])
  );

  const menuItems: Omit<MenuItemRecord, 'createdAt' | 'updatedAt'>[] =
    resolvedPortalState.menuItems.map((item, index) => {
      const rawCatIds =
        Array.isArray(item.categoryIds) && item.categoryIds.length > 0
          ? item.categoryIds
          : item.categoryId
            ? [item.categoryId]
            : [];
      const sanitizedCatIds = Array.from(
        new Set(
          rawCatIds
            .map((cid) => sanitizeFirestoreId(cid, ''))
            .filter(Boolean)
        )
      ).slice(0, 30);
      const categoryIds =
        sanitizedCatIds.length > 0 ? sanitizedCatIds : ['uncategorized'];
      const categoryNames = categoryIds.map(
        (cid) =>
          clampString(categoryNameById.get(cid) ?? 'Uncategorized', 80) || 'Uncategorized'
      );
      const primaryCatId = categoryIds[0];
      const combinedCategoryName =
        clampString(categoryNames.join(', '), 80) || 'Uncategorized';
      return {
        id: sanitizeFirestoreId(item.id, `item_${index + 1}`),
        clientId,
        createdByUid: uid,
        clientContactEmail: effectiveContactEmail,
        categoryId: primaryCatId,
        categoryName: combinedCategoryName,
        categoryIds,
        categoryNames,
        name: clampString(item.name, 120) || `Menu Item ${index + 1}`,
        description: clampString(item.description, 500),
        dietaryNotes: clampString(item.dietaryNotes, 120),
        price: clampNumber(item.price, 0, 50000),
        mediaUrl: clampUrl(item.mediaUrl, 1000),
        mediaAssetId: item.mediaAssetId
          ? sanitizeFirestoreId(item.mediaAssetId, 'asset')
          : item.mediaUrl
            ? sanitizeFirestoreId(`asset_menu_${item.id}`, 'asset')
            : '',
        available: Boolean(item.available),
        featured: Boolean(item.featured),
        sortOrder: Math.min(5000, index),
      };
    });

  const specials: Omit<DailySpecialRecord, 'createdAt' | 'updatedAt'>[] =
    resolvedPortalState.specials.map((special, index) => ({
      id: sanitizeFirestoreId(special.id, `special_${index + 1}`),
      clientId,
      createdByUid: uid,
      clientContactEmail: effectiveContactEmail,
      title: clampString(special.title, 140) || `Daily Special ${index + 1}`,
      windowLabel: clampString(special.windowLabel, 120),
      description: clampString(special.description, 500),
      specialPrice: clampNumber(special.specialPrice, 0, 50000),
      regularPrice: clampNumber(special.regularPrice ?? 0, 0, 50000),
      mediaUrl: clampUrl(special.mediaUrl, 1000),
      mediaKind: special.mediaKind === 'video' ? 'video' : 'image',
      mediaAssetId: special.mediaAssetId
        ? sanitizeFirestoreId(special.mediaAssetId, 'asset')
        : special.mediaUrl
          ? sanitizeFirestoreId(`asset_special_${special.id}`, 'asset')
          : '',
      active: Boolean(special.active),
      sortOrder: Math.min(1000, index),
    }));

  const mediaAssets = buildMediaAssetsFromRecords({
    clientId,
    uid,
    contactEmail: effectiveContactEmail,
    promotions,
    menuItems,
    specials,
  });

  const sourceDevices = Array.isArray(resolvedPortalState.devices)
    ? resolvedPortalState.devices
    : buildDefaultDevices(unitCount);

  const devices: Omit<DeviceScreenRecord, 'createdAt' | 'updatedAt'>[] =
    sourceDevices.map((device, index) => ({
      id: sanitizeFirestoreId(device.id, `dev_${index + 1}`),
      clientId,
      createdByUid: uid,
      clientContactEmail: effectiveContactEmail,
      name: clampString(device.name, 100) || `Screen ${index + 1}`,
      locationZone: clampString(device.locationZone, 80),
      orientation:
        device.orientation === 'landscape-10' ? 'landscape-10' : 'portrait-9-16',
      pairingCode: clampString(device.pairingCode, 24) || `TT-${1000 + index}`,
      status: device.status === 'paused' ? 'paused' : 'active',
      sortOrder: Math.min(5000, index),
    }));

  const existingIdsQueryMode: 'admin-all' | 'createdBy' | 'contactEmail' = isBootstrapAdmin
    ? 'admin-all'
    : !existingClient || existingClient.createdByUid === uid
      ? 'createdBy'
      : 'contactEmail';

  // Step 3: Commit all 6 normalized subcollection tables
  await Promise.all([
    syncSubcollectionDocs({
      clientId,
      subcollectionName: 'devices',
      uid,
      userEmail,
      isBootstrapAdmin,
      canListAny: isBootstrapAdmin,
      existingIdsQueryMode,
      records: devices,
      stripImmutableForUpdate: ({
        id: _id,
        clientId: _cid,
        createdByUid: _cb,
        ...mutable
      }) => mutable,
    }),
    syncSubcollectionDocs({
      clientId,
      subcollectionName: 'promotions',
      uid,
      userEmail,
      isBootstrapAdmin,
      canListAny: isBootstrapAdmin,
      existingIdsQueryMode,
      records: promotions,
      stripImmutableForUpdate: ({
        id: _id,
        clientId: _cid,
        createdByUid: _cb,
        ...mutable
      }) => mutable,
    }),
    syncSubcollectionDocs({
      clientId,
      subcollectionName: 'menuCategories',
      uid,
      userEmail,
      isBootstrapAdmin,
      canListAny: isBootstrapAdmin,
      existingIdsQueryMode,
      records: categories,
      stripImmutableForUpdate: ({
        id: _id,
        clientId: _cid,
        createdByUid: _cb,
        ...mutable
      }) => mutable,
    }),
    syncSubcollectionDocs({
      clientId,
      subcollectionName: 'menuItems',
      uid,
      userEmail,
      isBootstrapAdmin,
      canListAny: isBootstrapAdmin,
      existingIdsQueryMode,
      records: menuItems,
      stripImmutableForUpdate: ({
        id: _id,
        clientId: _cid,
        createdByUid: _cb,
        ...mutable
      }) => mutable,
    }),
    syncSubcollectionDocs({
      clientId,
      subcollectionName: 'specials',
      uid,
      userEmail,
      isBootstrapAdmin,
      canListAny: isBootstrapAdmin,
      existingIdsQueryMode,
      records: specials,
      stripImmutableForUpdate: ({
        id: _id,
        clientId: _cid,
        createdByUid: _cb,
        ...mutable
      }) => mutable,
    }),
    syncSubcollectionDocs({
      clientId,
      subcollectionName: 'mediaAssets',
      uid,
      userEmail,
      isBootstrapAdmin,
      canListAny: isBootstrapAdmin,
      existingIdsQueryMode,
      records: mediaAssets,
      stripImmutableForUpdate: ({
        id: _id,
        clientId: _cid,
        createdByUid: _cb,
        ...mutable
      }) => mutable,
    }),
  ]);

  return {
    clientId,
    resolvedPortalState,
    counts: {
      promotions: promotions.length,
      categories: categories.length,
      menuItems: menuItems.length,
      specials: specials.length,
      mediaAssets: mediaAssets.length,
    },
  };
}

export async function fetchClientTablesFromFirestore(params: {
  clientId: string;
  uid: string;
  userEmail: string;
  isBootstrapAdmin: boolean;
}): Promise<ClientPortalTablesBundle> {
  const { clientId, uid, isBootstrapAdmin } = params;
  const userEmail = params.userEmail.trim().toLowerCase();
  const clientPath = `clientAccounts/${clientId}`;

  let account: ClientAccount | null = null;
  try {
    const snap = await getDoc(doc(db, 'clientAccounts', clientId));
    if (!snap.exists()) {
      throw new Error(`Client account "${clientId}" was not found.`);
    }
    account = { ...(snap.data() as ClientAccount), id: snap.id };
  } catch (err) {
    if (err instanceof Error && err.message.includes('was not found')) throw err;
    handleFirestoreError(err, OperationType.GET, clientPath);
  }

  const listMode: 'admin-all' | 'createdBy' | 'contactEmail' = isBootstrapAdmin
    ? 'admin-all'
    : account!.createdByUid === uid
      ? 'createdBy'
      : 'contactEmail';

  const readSubcollection = async <T>(
    subName: (typeof SUBCOLLECTIONS)[number]
  ): Promise<T[]> => {
    const subPath = `clientAccounts/${clientId}/${subName}`;
    const colRef = collection(db, 'clientAccounts', clientId, subName);
    const q =
      listMode === 'admin-all'
        ? query(colRef)
        : listMode === 'contactEmail'
          ? query(colRef, where('clientContactEmail', '==', userEmail))
          : query(colRef, where('createdByUid', '==', uid));
    try {
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, subPath);
    }
  };

  const [rawDevices, rawPromotions, categories, rawMenuItems, rawSpecials, rawMediaAssets] =
    await Promise.all([
      readSubcollection<DeviceScreenRecord>('devices'),
      readSubcollection<PromotionRecord>('promotions'),
      readSubcollection<MenuCategoryRecord>('menuCategories'),
      readSubcollection<MenuItemRecord>('menuItems'),
      readSubcollection<DailySpecialRecord>('specials'),
      readSubcollection<MediaAssetRecord>('mediaAssets'),
    ]);

  const pruneMockDocs = (
    subName: (typeof SUBCOLLECTIONS)[number],
    mockIds: string[]
  ) => {
    mockIds.forEach((docId) => {
      void deleteDoc(doc(db, 'clientAccounts', clientId, subName, docId)).catch(() => null);
    });
  };

  const isMockPromo = (p: PromotionRecord) =>
    MOCK_PROMOTION_IDS.has(p.id) || isStockAssetUrl(p.mediaUrl);
  const isMockMenu = (m: MenuItemRecord) =>
    MOCK_MENU_ITEM_IDS.has(m.id) || isStockAssetUrl(m.mediaUrl);
  const isMockSpecial = (s: DailySpecialRecord) =>
    MOCK_SPECIAL_IDS.has(s.id) || isStockAssetUrl(s.mediaUrl);
  const isMockMedia = (a: MediaAssetRecord) =>
    isStockAssetUrl(a.url) ||
    MOCK_PROMOTION_IDS.has(a.sourceId) ||
    MOCK_MENU_ITEM_IDS.has(a.sourceId) ||
    MOCK_SPECIAL_IDS.has(a.sourceId);

  pruneMockDocs('promotions', rawPromotions.filter(isMockPromo).map((p) => p.id));
  pruneMockDocs('menuItems', rawMenuItems.filter(isMockMenu).map((m) => m.id));
  pruneMockDocs('specials', rawSpecials.filter(isMockSpecial).map((s) => s.id));
  pruneMockDocs('mediaAssets', rawMediaAssets.filter(isMockMedia).map((a) => a.id));

  const devices = rawDevices;
  const promotions = rawPromotions.filter((p) => !isMockPromo(p));
  const menuItems = rawMenuItems.filter((m) => !isMockMenu(m));
  const specials = rawSpecials.filter((s) => !isMockSpecial(s));
  const mediaAssets = rawMediaAssets.filter((a) => !isMockMedia(a));

  devices.sort((a, b) => a.sortOrder - b.sortOrder);
  promotions.sort((a, b) => a.sortOrder - b.sortOrder);
  categories.sort((a, b) => a.sortOrder - b.sortOrder);
  menuItems.sort((a, b) => a.sortOrder - b.sortOrder);
  specials.sort((a, b) => a.sortOrder - b.sortOrder);
  mediaAssets.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

  return {
    account: account!,
    devices,
    promotions,
    categories,
    menuItems,
    specials,
    mediaAssets,
  };
}

export function clientTablesToPortalState(bundle: ClientPortalTablesBundle): PortalState {
  const { account } = bundle;
  const activeUnits = Math.max(0, account.activeUnits || 0);
  const derivedBaseFee =
    account.monthlyBaseFeePerUnit ??
    (activeUnits > 0 ? Math.round((account.monthlySubscriptionFee / activeUnits) * 100) / 100 : 15);

  const promotions: PromotionItem[] = bundle.promotions.map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    scheduleLabel: p.scheduleLabel,
    durationSec: p.durationSec,
    mediaUrl: p.mediaUrl,
    mediaKind: p.mediaKind,
    mediaAssetId: p.mediaAssetId || undefined,
    active: p.active,
    ctaLabel: p.ctaLabel || undefined,
    schedule: {
      mode: p.scheduleMode,
      startDate: p.startDate || undefined,
      endDate: p.endDate || undefined,
      startTime: p.startTime || undefined,
      endTime: p.endTime || undefined,
    },
  }));

  const categories: MenuCategory[] = bundle.categories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const menuItems: MenuItem[] = bundle.menuItems.map((m) => {
    const normalizedCategoryIds = Array.from(
      new Set(
        (Array.isArray(m.categoryIds) && m.categoryIds.length > 0
          ? m.categoryIds
          : m.categoryId
            ? [m.categoryId]
            : []
        ).filter(Boolean)
      )
    );
    return {
      id: m.id,
      categoryId: normalizedCategoryIds[0] ?? m.categoryId,
      categoryIds: normalizedCategoryIds,
      name: m.name,
      description: m.description,
      price: m.price,
      dietaryNotes: m.dietaryNotes,
      mediaUrl: m.mediaUrl || undefined,
      mediaAssetId: m.mediaAssetId || undefined,
      available: m.available,
      featured: m.featured,
    };
  });

  const specials: DailySpecial[] = bundle.specials.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    specialPrice: s.specialPrice,
    regularPrice: s.regularPrice > 0 ? s.regularPrice : undefined,
    windowLabel: s.windowLabel,
    mediaUrl: s.mediaUrl,
    mediaKind: s.mediaKind,
    mediaAssetId: s.mediaAssetId || undefined,
    active: s.active,
  }));

  const devices: TabletopDevice[] =
    bundle.devices && bundle.devices.length > 0
      ? bundle.devices.map((d) => ({
          id: d.id,
          name: d.name,
          locationZone: d.locationZone,
          orientation:
            d.orientation === 'landscape-10' ? 'landscape-10' : 'portrait-9-16',
          pairingCode: d.pairingCode,
          status: d.status === 'paused' ? 'paused' : 'active',
        }))
      : buildDefaultDevices(activeUnits);

  return {
    venue: {
      name: account.businessName,
      tagline: account.tagline ?? '',
      unitCount: activeUnits,
      monthlyBaseFeePerUnit: derivedBaseFee,
      accentTheme: account.accentTheme ?? 'amber',
      lastPublishedAt: account.lastPublishedAt || new Date().toISOString(),
    },
    devices,
    promotions,
    categories,
    menuItems,
    specials,
    adMonetization: {
      optedIn: account.adProgramOptedIn,
      creditPerUnitMonthly: account.creditPerUnitMonthly ?? 1,
      rotationRatioLabel:
        account.rotationRatioLabel || '1 partner slot per 3 venue promos',
      activeSince: account.adActiveSince || '2025-02-01',
    },
  };
}
