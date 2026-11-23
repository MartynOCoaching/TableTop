export type MediaKind = 'image' | 'video';

export type DashboardTab = 'promotions' | 'menu' | 'specials' | 'devices' | 'media' | 'ads';

export type EmulatorMode = 'attract' | 'menu' | 'specials' | 'ad-slot';

export type DeviceFrame = 'landscape-10' | 'portrait-8';

export type ScreenStatus = 'active' | 'paused';

export type ScreenOrientation = 'portrait-9-16' | 'landscape-10';

export type AccentTheme = 'amber' | 'emerald' | 'crimson' | 'slate';

export type UserRole = 'client' | 'super_admin';

export type ClientAccountStatus = 'active' | 'onboarding' | 'paused';

export interface VenueProfile {
  clientId?: string;
  name: string;
  tagline: string;
  unitCount: number;
  monthlyBaseFeePerUnit: number;
  accentTheme: AccentTheme;
  lastPublishedAt: string;
}

export interface PromotionSchedule {
  mode: 'always' | 'scheduled';
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
}

export interface PromotionItem {
  id: string;
  title: string;
  subtitle: string;
  scheduleLabel: string;
  durationSec: number;
  mediaUrl: string;
  mediaKind: MediaKind;
  mediaAssetId?: string;
  active: boolean;
  ctaLabel?: string;
  schedule?: PromotionSchedule;
}

export interface MenuCategory {
  id: string;
  name: string;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  categoryIds?: string[];
  name: string;
  description: string;
  price: number;
  dietaryNotes: string;
  mediaUrl?: string;
  mediaAssetId?: string;
  available: boolean;
  featured: boolean;
}

export interface DailySpecial {
  id: string;
  title: string;
  description: string;
  specialPrice: number;
  regularPrice?: number;
  windowLabel: string;
  mediaUrl: string;
  mediaKind: MediaKind;
  mediaAssetId?: string;
  active: boolean;
}

export type AdTargetScope = 'all' | 'selected';

export interface AdminNetworkAd {
  id: string;
  sponsorName: string;
  headline: string;
  bodyCopy: string;
  mediaUrl: string;
  mediaKind: MediaKind;
  durationSec: number;
  categoryTag: string;
  active?: boolean;
  targetScope?: AdTargetScope;
  targetClientIds?: string[];
  createdByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdMonetizationConfig {
  optedIn: boolean;
  creditPerUnitMonthly: number;
  rotationRatioLabel: string;
  activeSince: string;
}

export interface TabletopDevice {
  id: string;
  name: string;
  locationZone: string;
  orientation: ScreenOrientation;
  pairingCode: string;
  status: ScreenStatus;
}

export interface PortalState {
  venue: VenueProfile;
  devices: TabletopDevice[];
  promotions: PromotionItem[];
  categories: MenuCategory[];
  menuItems: MenuItem[];
  specials: DailySpecial[];
  adMonetization: AdMonetizationConfig;
}

export interface ClientAccount {
  id: string;
  businessName: string;
  tagline?: string;
  contactEmail: string;
  ownerUid?: string;
  accentTheme?: AccentTheme;
  status: ClientAccountStatus;
  activeUnits: number;
  monthlyBaseFeePerUnit?: number;
  monthlySubscriptionFee: number;
  monthlyCredit: number;
  totalMonthlyBill: number;
  adProgramOptedIn: boolean;
  creditPerUnitMonthly: number;
  rotationRatioLabel?: string;
  adActiveSince?: string;
  lastPublishedAt?: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PromotionRecord {
  id: string;
  clientId: string;
  createdByUid: string;
  clientContactEmail: string;
  sortOrder: number;
  title: string;
  scheduleLabel: string;
  subtitle: string;
  ctaLabel: string;
  durationSec: number;
  mediaUrl: string;
  mediaKind: MediaKind;
  mediaAssetId: string;
  active: boolean;
  scheduleMode: 'always' | 'scheduled';
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MenuCategoryRecord {
  id: string;
  clientId: string;
  createdByUid: string;
  clientContactEmail: string;
  name: string;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MenuItemRecord {
  id: string;
  clientId: string;
  createdByUid: string;
  clientContactEmail: string;
  categoryId: string;
  categoryName: string;
  categoryIds?: string[];
  categoryNames?: string[];
  name: string;
  description: string;
  dietaryNotes: string;
  price: number;
  mediaUrl: string;
  mediaAssetId: string;
  available: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DailySpecialRecord {
  id: string;
  clientId: string;
  createdByUid: string;
  clientContactEmail: string;
  title: string;
  windowLabel: string;
  description: string;
  specialPrice: number;
  regularPrice: number;
  mediaUrl: string;
  mediaKind: MediaKind;
  mediaAssetId: string;
  active: boolean;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MediaAssetRecord {
  id: string;
  clientId: string;
  createdByUid: string;
  clientContactEmail: string;
  url: string;
  kind: MediaKind;
  sourceType: 'promotion' | 'menu' | 'special';
  sourceId: string;
  label: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeviceScreenRecord {
  id: string;
  clientId: string;
  createdByUid: string;
  clientContactEmail: string;
  name: string;
  locationZone: string;
  orientation: ScreenOrientation;
  pairingCode: string;
  status: ScreenStatus;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClientPortalTablesBundle {
  account: ClientAccount;
  devices: DeviceScreenRecord[];
  promotions: PromotionRecord[];
  categories: MenuCategoryRecord[];
  menuItems: MenuItemRecord[];
  specials: DailySpecialRecord[];
  mediaAssets: MediaAssetRecord[];
}

export interface AdminInvite {
  email: string;
  note?: string;
  grantedBy: string;
  createdAt?: unknown;
}
