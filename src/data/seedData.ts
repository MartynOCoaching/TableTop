import type { AdminNetworkAd, PortalState } from '../types.ts';

export const MOCK_PROMOTION_IDS = new Set(['promo-1', 'promo-2']);
export const MOCK_MENU_ITEM_IDS = new Set([
  'item-1',
  'item-2',
  'item-3',
  'item-4',
  'item-5',
  'item-6',
  'item-7',
  'item-8',
]);
export const MOCK_SPECIAL_IDS = new Set(['spec-1', 'spec-2']);

export function isStockAssetUrl(url?: string | null): boolean {
  return (url ?? '').trim().startsWith('/src/assets/images/');
}

export function stripLegacyMockPortalState(state: PortalState): PortalState {
  const promotions = (state.promotions ?? []).filter(
    (p) => !MOCK_PROMOTION_IDS.has(p.id) && !isStockAssetUrl(p.mediaUrl)
  );
  const menuItems = (state.menuItems ?? []).filter(
    (m) => !MOCK_MENU_ITEM_IDS.has(m.id) && !isStockAssetUrl(m.mediaUrl)
  );
  const specials = (state.specials ?? []).filter(
    (s) => !MOCK_SPECIAL_IDS.has(s.id) && !isStockAssetUrl(s.mediaUrl)
  );
  const devices = Array.isArray(state.devices) ? state.devices : [];

  return {
    ...state,
    promotions,
    menuItems,
    specials,
    devices,
  };
}

export const SEED_PORTAL_STATE: PortalState = {
  venue: {
    name: 'Grit City Distillery',
    tagline: 'Speakeasy & Craft Cocktail Bar',
    unitCount: 0,
    monthlyBaseFeePerUnit: 15,
    accentTheme: 'amber',
    lastPublishedAt: '2026-11-20T07:30:00.000Z',
  },
  devices: [],
  promotions: [],
  categories: [
    { id: 'cat-cocktails', name: 'Cocktails & Spirits' },
    { id: 'cat-beer', name: 'Draft & Craft Beer' },
    { id: 'cat-plates', name: 'Small Plates' },
    { id: 'cat-mains', name: 'Mains' },
    { id: 'cat-pizza', name: 'Pizza' },
    { id: 'cat-desserts', name: 'Desserts' },
  ],
  menuItems: [],
  specials: [],
  adMonetization: {
    optedIn: true,
    creditPerUnitMonthly: 1.0,
    rotationRatioLabel: '1 partner slot every 3 client slides',
    activeSince: 'November 2026',
  },
};

/**
 * Network ads are supplied exclusively by Super Admin uploads.
 * Stock partner ads are intentionally omitted.
 */
export const ADMIN_NETWORK_ADS: AdminNetworkAd[] = [];
