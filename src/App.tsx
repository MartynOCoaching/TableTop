import { useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  Check,
  Cloud,
  Copy,
  ExternalLink,
  Flame,
  FolderOpen,
  Image as ImageIcon,
  LogIn,
  Monitor,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  User,
  UtensilsCrossed,
} from 'lucide-react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { SEED_PORTAL_STATE } from './data/seedData';
import {
  AdminNetworkAd,
  ClientAccount,
  DashboardTab,
  EmulatorMode,
  PortalState,
  VenueProfile,
} from './types';
import {
  clearAllPortalStorage,
  deleteMediaBlob,
  hasSavedPortalState,
  hydratePortalMedia,
  loadPortalState,
  savePortalState,
} from './utils/storage';
import { countActiveDevices, reconcileDevicesWithUnitCount } from './utils/devices';
import {
  fetchPublishedState,
  publishPortalState,
  resetPublishedStateOnServer,
} from './utils/publishSync';
import { PromotionsManager } from './components/PromotionsManager';
import { MenuManager } from './components/MenuManager';
import { SpecialsManager } from './components/SpecialsManager';
import { DevicesManager } from './components/DevicesManager';
import { AdMonetizationManager } from './components/AdMonetizationManager';
import { MediaLibraryManager, StoredMediaEntry } from './components/MediaLibraryManager';
import { DeviceEmulator } from './components/DeviceEmulator';
import { VenueSettingsModal } from './components/VenueSettingsModal';
import { StandaloneEmulatorPage } from './components/StandaloneEmulatorPage';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { slugifyClientId, syncClientTablesToFirestore } from './services/clientTablesService';
import {
  fetchServerNetworkAds,
  filterNetworkAdsForClient,
  subscribeActiveNetworkAds,
} from './services/networkAdsService';
import { computeClientBilling } from './services/superAdminService';

const ACTIVE_CLIENT_STORAGE_KEY = 'tabletop_studio_active_client_id';

const NAV_TABS: {
  id: DashboardTab;
  label: string;
  mobileLabel: string;
  icon: typeof ImageIcon;
}[] = [
  { id: 'promotions', label: 'Promotions', mobileLabel: 'Promos', icon: ImageIcon },
  { id: 'menu', label: 'Menu', mobileLabel: 'Menu', icon: UtensilsCrossed },
  { id: 'specials', label: 'Daily Specials', mobileLabel: 'Specials', icon: Flame },
  { id: 'devices', label: 'Devices', mobileLabel: 'Devices', icon: Monitor },
  { id: 'media', label: 'Media', mobileLabel: 'Media', icon: FolderOpen },
  { id: 'ads', label: 'Ad Network', mobileLabel: 'Ads', icon: BadgeDollarSign },
];

const MOBILE_NAV_TABS = NAV_TABS.filter((tab) => tab.id !== 'devices');

type AppRoute = 'portal' | 'emulator' | 'admin';

function resolveRoute(): AppRoute {
  if (typeof window === 'undefined') return 'portal';
  const p = window.location.pathname.replace(/\/+$/, '');
  if (p === '/emulator') return 'emulator';
  if (p === '/admin') return 'admin';
  return 'portal';
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute());

  const [activeClientId, setActiveClientId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [portalReloadKey, setPortalReloadKey] = useState(0);

  const updateActiveClientId = (nextId: string | null) => {
    setActiveClientId(nextId);
    try {
      if (nextId) {
        localStorage.setItem(ACTIVE_CLIENT_STORAGE_KEY, nextId);
      } else {
        localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  };

  useEffect(() => {
    const handlePop = () => setRoute(resolveRoute());
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = (nextRoute: AppRoute) => {
    const path = nextRoute === 'portal' ? '/' : `/${nextRoute}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setRoute(nextRoute);
  };

  if (route === 'emulator') {
    return <StandaloneEmulatorPage />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        {route === 'admin' ? (
          <SuperAdminDashboard
            onNavigatePortal={() => navigate('portal')}
            onOpenClientInPortal={(loadedState, clientId) => {
              savePortalState(loadedState);
              updateActiveClientId(clientId);
              setPortalReloadKey((k) => k + 1);
              navigate('portal');
            }}
          />
        ) : (
          <ClientPortalDashboard
            key={portalReloadKey}
            activeClientId={activeClientId}
            onActiveClientIdChange={updateActiveClientId}
            onNavigateAdmin={() => navigate('admin')}
          />
        )}
      </AuthProvider>
    </ErrorBoundary>
  );
}

function ClientPortalDashboard({
  activeClientId,
  onActiveClientIdChange,
  onNavigateAdmin,
}: {
  activeClientId: string | null;
  onActiveClientIdChange: (clientId: string | null) => void;
  onNavigateAdmin: () => void;
}) {
  const { user, isSuperAdmin, isBootstrapAdmin, signInWithGoogle, authBusy } = useAuth();
  const [state, setState] = useState<PortalState>(() => loadPortalState());
  const [activeTab, setActiveTab] = useState<DashboardTab>('promotions');
  const [emulatorMode, setEmulatorMode] = useState<EmulatorMode>('attract');
  const [mobilePane, setMobilePane] = useState<'editor' | 'emulator'>('editor');
  const [focusedPromoId, setFocusedPromoId] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'synced' | 'error'>(
    'idle'
  );
  const [cloudSyncState, setCloudSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>(
    'idle'
  );
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [networkAds, setNetworkAds] = useState<AdminNetworkAd[]>([]);

  useEffect(() => {
    let active = true;
    void fetchServerNetworkAds().then((ads) => {
      if (active && ads) {
        setNetworkAds(ads);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.emailVerified) return;
    const unsub = subscribeActiveNetworkAds(
      (ads) => {
        setNetworkAds(ads);
      },
      () => {
        // Fallback to server/seed network ads if Firestore rules reject unauthenticated/unverified reads
      }
    );
    return () => unsub();
  }, [user?.emailVerified, user?.uid]);

  const resolvedClientId = activeClientId || state.venue.clientId || null;

  useEffect(() => {
    if (!user?.emailVerified || !resolvedClientId) return;
    let active = true;
    void getDoc(doc(db, 'clientAccounts', resolvedClientId))
      .then((snap) => {
        if (!active || !snap.exists()) return;
        const acc = snap.data() as ClientAccount;
        setState((prev) => {
          if (
            prev.adMonetization.optedIn === Boolean(acc.adProgramOptedIn) &&
            prev.venue.clientId === resolvedClientId
          ) {
            return prev;
          }
          return {
            ...prev,
            venue: {
              ...prev.venue,
              clientId: resolvedClientId,
            },
            adMonetization: {
              ...prev.adMonetization,
              optedIn: Boolean(acc.adProgramOptedIn),
            },
          };
        });
      })
      .catch(() => {
        // Client doc may not exist in Firestore yet
      });
    return () => {
      active = false;
    };
  }, [user?.emailVerified, user?.uid, resolvedClientId]);

  const clientNetworkAds = useMemo(
    () => filterNetworkAdsForClient(networkAds, resolvedClientId, state.venue.name),
    [networkAds, resolvedClientId, state.venue.name]
  );

  // Hydrate uploaded media from IndexedDB, or load current published venue when local draft is empty
  useEffect(() => {
    let active = true;
    const hadLocalDraft = hasSavedPortalState();

    void hydratePortalMedia(state).then(async (hydrated) => {
      if (!active) return;
      setState(hydrated);

      if (!hadLocalDraft) {
        const published = await fetchPublishedState();
        if (active && published?.state) {
          setState(published.state);
          savePortalState(published.state);
        }
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist structured portal edits automatically
  useEffect(() => {
    savePortalState(state);
  }, [state]);

  const updateDraftState = (updater: (prev: PortalState) => PortalState) => {
    setState(updater);
    setHasUnpublishedChanges(true);
  };

  const handleTabSelect = (tab: DashboardTab) => {
    setActiveTab(tab);
    if (tab === 'promotions') setEmulatorMode('attract');
    if (tab === 'menu') setEmulatorMode('menu');
    if (tab === 'specials') setEmulatorMode('specials');
    if (tab === 'ads') setEmulatorMode('ad-slot');
  };

  const syncPortalToCloud = async (portalPayload: PortalState) => {
    if (!user || !user.emailVerified) return;
    setCloudSyncState('syncing');
    setCloudSyncError(null);
    try {
      const targetClientId =
        activeClientId || slugifyClientId(portalPayload.venue.name);
      const syncResult = await syncClientTablesToFirestore({
        uid: user.uid,
        userEmail: user.email ?? '',
        isAdmin: isSuperAdmin,
        isBootstrapAdmin,
        clientId: targetClientId,
        portalState: portalPayload,
      });
      onActiveClientIdChange(syncResult.clientId);
      setState({
        ...syncResult.resolvedPortalState,
        venue: {
          ...syncResult.resolvedPortalState.venue,
          clientId: syncResult.clientId,
        },
      });
      setCloudSyncState('synced');
      window.setTimeout(() => setCloudSyncState('idle'), 3000);
    } catch (err) {
      setCloudSyncState('error');
      setCloudSyncError(
        err instanceof Error ? err.message : 'Unable to sync venue tables to cloud.'
      );
    }
  };

  const handlePublish = async () => {
    setPublishStatus('publishing');
    try {
      const payloadToPublish: PortalState =
        resolvedClientId && state.venue.clientId !== resolvedClientId
          ? {
              ...state,
              venue: { ...state.venue, clientId: resolvedClientId },
            }
          : state;
      const result = await publishPortalState(payloadToPublish);
      setState(result.resolvedState);
      setHasUnpublishedChanges(false);
      setPublishStatus('synced');
      if (user?.emailVerified) {
        await syncPortalToCloud(result.resolvedState);
      }
      window.setTimeout(() => setPublishStatus('idle'), 2800);
    } catch {
      setPublishStatus('error');
      window.setTimeout(() => setPublishStatus('idle'), 3000);
    }
  };

  const handleResetDemo = () => {
    void clearAllPortalStorage().then(async () => {
      onActiveClientIdChange(null);
      setState(SEED_PORTAL_STATE);
      setHasUnpublishedChanges(false);
      setEmulatorMode('attract');
      setFocusedPromoId(null);
      setFocusedCategoryId(null);
      await resetPublishedStateOnServer();
    });
  };

  const handleCopyEmulatorUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/emulator`);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const deleteStoredMediaEntries = async (entries: StoredMediaEntry[]) => {
    if (entries.length === 0) return;

    const serverFilenames = new Set<string>();
    const assetIds = new Set<string>();
    const promoIds = new Set<string>();
    const specialIds = new Set<string>();
    const menuIds = new Set<string>();

    entries.forEach((entry) => {
      if (entry.serverFilename) {
        serverFilenames.add(entry.serverFilename);
      }
      if (entry.assetId) {
        assetIds.add(entry.assetId);
      }
      entry.usages.forEach((usage) => {
        if (usage.sourceType === 'promotion') promoIds.add(usage.sourceId);
        if (usage.sourceType === 'special') specialIds.add(usage.sourceId);
        if (usage.sourceType === 'menu') menuIds.add(usage.sourceId);
      });
    });

    await Promise.all([
      ...Array.from(serverFilenames).map((filename) =>
        fetch(`/api/media/${encodeURIComponent(filename)}`, {
          method: 'DELETE',
        }).catch(() => null)
      ),
      ...Array.from(assetIds).map((assetId) => deleteMediaBlob(assetId)),
    ]);

    if (promoIds.size > 0 || specialIds.size > 0 || menuIds.size > 0) {
      updateDraftState((prev) => ({
        ...prev,
        promotions:
          promoIds.size > 0
            ? prev.promotions.filter((p) => !promoIds.has(p.id))
            : prev.promotions,
        specials:
          specialIds.size > 0
            ? prev.specials.filter((s) => !specialIds.has(s.id))
            : prev.specials,
        menuItems:
          menuIds.size > 0
            ? prev.menuItems.map((m) =>
                menuIds.has(m.id)
                  ? { ...m, mediaUrl: undefined, mediaAssetId: undefined }
                  : m
              )
            : prev.menuItems,
      }));
    }
  };

  const monthlyAdCredit = state.adMonetization.optedIn
    ? state.venue.unitCount * state.adMonetization.creditPerUnitMonthly
    : 0;

  const formattedPublishedTime = (() => {
    try {
      return new Date(state.venue.lastPublishedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  })();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="md:sticky md:top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleTabSelect('promotions');
          }}
          className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Tabletop Studio
        </a>

        <nav
          aria-label="Portal sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabSelect(tab.id)}
                className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishStatus === 'publishing'}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-70 ${
              publishStatus === 'synced'
                ? 'bg-emerald-700 text-white'
                : publishStatus === 'error'
                  ? 'bg-red-700 text-white'
                  : hasUnpublishedChanges
                    ? 'bg-amber-700 text-white hover:bg-amber-800'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {publishStatus === 'synced' ? (
              <>
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                Published to /emulator
              </>
            ) : publishStatus === 'publishing' ? (
              <>
                <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
                Publishing...
              </>
            ) : publishStatus === 'error' ? (
              <span>Retry Publish</span>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
                {hasUnpublishedChanges ? 'Publish Changes' : 'Publish to Devices'}
              </>
            )}
          </button>
        </div>
      </header>

      {/* Venue Workspace Toolbar */}
      <div className="border-b border-slate-200 bg-white/70 px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
          <h1 className="text-sm font-semibold text-slate-900 truncate">{state.venue.name}</h1>
          <div className="text-xs text-slate-500 tabular-nums">
            <span>{state.venue.unitCount} active tabletop units</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className={state.adMonetization.optedIn ? 'text-emerald-700 font-medium' : ''}>
              {state.adMonetization.optedIn
                ? `Ad Credit −$${monthlyAdCredit.toFixed(2)}/mo`
                : 'Ad Network Opted Out'}
            </span>
            <span className="mx-1.5 hidden sm:inline" aria-hidden="true">·</span>
            <span className="hidden sm:inline">
              {hasUnpublishedChanges
                ? 'Unpublished draft edits'
                : `Last pushed ${formattedPublishedTime}`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mobile Split-Screen Pane Switcher (< lg) */}
          <div className="flex lg:hidden items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setMobilePane('editor')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                mobilePane === 'editor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Editor
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('emulator')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                mobilePane === 'emulator' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Live Emulator
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              handleTabSelect('devices');
              setMobilePane('editor');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'devices'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Devices
            <span className="font-mono tabular-nums opacity-75">({state.devices.length})</span>
          </button>

          <a
            href="/emulator"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Open /emulator
          </a>

          {user ? (
            <button
              type="button"
              onClick={() => void syncPortalToCloud(state)}
              disabled={cloudSyncState === 'syncing'}
              title={
                cloudSyncError ||
                `Sync ${state.venue.name} tables to Firestore (${user.email})`
              }
              className={`hidden md:inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                cloudSyncState === 'synced'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : cloudSyncState === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              {cloudSyncState === 'syncing'
                ? 'Syncing DB...'
                : cloudSyncState === 'synced'
                  ? 'DB Synced'
                  : cloudSyncState === 'error'
                    ? 'Retry DB Sync'
                    : 'Sync to DB'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={authBusy}
              className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              Sign In to Sync
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateAdmin}
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
            Super Admin
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            Venue Settings
          </button>
        </div>
      </div>

      {cloudSyncError && (
        <div className="border-b border-red-200 bg-red-50 px-4 sm:px-6 lg:px-8 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>Database sync notice: {cloudSyncError}</span>
          <button
            type="button"
            onClick={() => setCloudSyncError(null)}
            className="text-red-700 hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split-Screen Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* Left Pane: Client Content & Monetization Dashboard */}
        <section
          aria-label="Content Editor"
          className={`lg:col-span-6 xl:col-span-6 border-r border-slate-200 bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8 lg:h-[calc(100vh-7.25rem)] lg:overflow-y-auto studio-scroll ${
            mobilePane === 'editor' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="max-w-2xl mx-auto pb-4">
            {activeTab === 'promotions' && (
              <PromotionsManager
                promotions={state.promotions}
                onChange={(promotions) => updateDraftState((prev) => ({ ...prev, promotions }))}
                onPreviewSlide={(promoId, openEmulator = true) => {
                  setFocusedPromoId(promoId);
                  setPreviewNonce((n) => n + 1);
                  setEmulatorMode('attract');
                  if (openEmulator) {
                    setMobilePane('emulator');
                  }
                }}
              />
            )}

            {activeTab === 'menu' && (
              <MenuManager
                categories={state.categories}
                items={state.menuItems}
                onCategoriesChange={(categories) =>
                  updateDraftState((prev) => ({ ...prev, categories }))
                }
                onItemsChange={(menuItems) => updateDraftState((prev) => ({ ...prev, menuItems }))}
                onPreviewMenu={(categoryId, openEmulator = true) => {
                  if (categoryId) setFocusedCategoryId(categoryId);
                  setEmulatorMode('menu');
                  if (openEmulator) {
                    setMobilePane('emulator');
                  }
                }}
              />
            )}

            {activeTab === 'specials' && (
              <SpecialsManager
                specials={state.specials}
                onChange={(specials) => updateDraftState((prev) => ({ ...prev, specials }))}
                onPreviewSpecials={(openEmulator = true) => {
                  setEmulatorMode('specials');
                  if (openEmulator) {
                    setMobilePane('emulator');
                  }
                }}
              />
            )}

            {activeTab === 'devices' && (
              <DevicesManager
                venueName={state.venue.name}
                monthlyBaseFeePerUnit={state.venue.monthlyBaseFeePerUnit}
                devices={state.devices}
                onChange={(devices) =>
                  updateDraftState((prev) => ({
                    ...prev,
                    devices,
                    venue: {
                      ...prev.venue,
                      unitCount: countActiveDevices(devices),
                    },
                  }))
                }
                onPreviewDevice={() => {
                  setEmulatorMode('attract');
                  setMobilePane('emulator');
                }}
              />
            )}

            {activeTab === 'media' && (
              <MediaLibraryManager
                state={state}
                onDeleteMedia={(entry) => deleteStoredMediaEntries([entry])}
                onDeleteUnusedMedia={(entries) => deleteStoredMediaEntries(entries)}
                onNavigateTab={(tab) => handleTabSelect(tab)}
              />
            )}

            {activeTab === 'ads' && (
              <AdMonetizationManager
                venue={state.venue}
                config={state.adMonetization}
                networkAds={clientNetworkAds}
                onToggleOptIn={(optedIn) => {
                  updateDraftState((prev) => ({
                    ...prev,
                    adMonetization: { ...prev.adMonetization, optedIn },
                  }));
                  if (user?.emailVerified && resolvedClientId) {
                    const billing = computeClientBilling({
                      activeUnits: state.venue.unitCount,
                      monthlySubscriptionFee:
                        state.venue.unitCount * state.venue.monthlyBaseFeePerUnit,
                      adProgramOptedIn: optedIn,
                      creditPerUnitMonthly: state.adMonetization.creditPerUnitMonthly,
                    });
                    void updateDoc(doc(db, 'clientAccounts', resolvedClientId), {
                      adProgramOptedIn: optedIn,
                      monthlyCredit: billing.monthlyCredit,
                      totalMonthlyBill: billing.totalMonthlyBill,
                      updatedAt: serverTimestamp(),
                    }).catch(() => {
                      // Ignore if client account hasn't been synced to Firestore yet
                    });
                  }
                }}
                onUpdateUnitCount={(unitCount) =>
                  updateDraftState((prev) => ({
                    ...prev,
                    venue: { ...prev.venue, unitCount },
                    devices: reconcileDevicesWithUnitCount(prev.devices, unitCount),
                  }))
                }
                onPreviewAdSlot={() => {
                  setEmulatorMode('ad-slot');
                  setMobilePane('emulator');
                }}
              />
            )}
          </div>
        </section>

        {/* Right Pane: Real-Time Tabletop Device Emulator */}
        <section
          aria-label="Live Device Emulator"
          className={`lg:col-span-6 xl:col-span-6 bg-white px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8 lg:h-[calc(100vh-7.25rem)] lg:sticky lg:top-16 overflow-y-auto studio-scroll ${
            mobilePane === 'emulator' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="h-full max-w-2xl mx-auto flex flex-col">
            <DeviceEmulator
              state={state}
              networkAds={clientNetworkAds}
              mode={emulatorMode}
              onModeChange={setEmulatorMode}
              focusedPromoId={focusedPromoId}
              previewTrigger={previewNonce}
              focusedCategoryId={focusedCategoryId}
              headerAction={
                <button
                  type="button"
                  onClick={() => void handleCopyEmulatorUrl()}
                  title="Copy standalone /emulator URL for client presentations"
                  className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      /emulator URL
                    </>
                  )}
                </button>
              }
            />
          </div>
        </section>
      </main>

      {/* Small Screen Bottom Navigation Bar (< md) */}
      <nav
        aria-label="Mobile portal navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-6 h-16">
          {MOBILE_NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = !settingsOpen && activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  handleTabSelect(tab.id);
                  setMobilePane('editor');
                }}
                className={`relative flex flex-col items-center justify-center gap-1 px-0.5 text-[10px] sm:text-[11px] font-medium transition-colors min-w-0 ${
                  isActive
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 inset-x-2.5 h-0.5 bg-slate-900 rounded-b-full"
                  />
                )}
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-amber-700' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate max-w-full whitespace-nowrap">{tab.mobileLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`relative flex flex-col items-center justify-center gap-1 px-0.5 text-[10px] sm:text-[11px] font-medium transition-colors min-w-0 ${
              settingsOpen
                ? 'text-slate-900'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {settingsOpen && (
              <span
                aria-hidden="true"
                className="absolute top-0 inset-x-3 h-0.5 bg-slate-900 rounded-b-full"
              />
            )}
            <User
              className={`w-4 h-4 shrink-0 ${
                settingsOpen ? 'text-amber-700' : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span className="truncate max-w-full whitespace-nowrap">Profile</span>
          </button>
        </div>
      </nav>

      {settingsOpen && (
        <VenueSettingsModal
          venue={state.venue}
          deviceCount={state.devices.length}
          onManageDevices={() => {
            setSettingsOpen(false);
            handleTabSelect('devices');
            setMobilePane('editor');
          }}
          onClose={() => setSettingsOpen(false)}
          onSave={(venue: VenueProfile) =>
            updateDraftState((prev) => ({
              ...prev,
              venue,
              devices: reconcileDevicesWithUnitCount(prev.devices, venue.unitCount),
            }))
          }
          onResetDemo={handleResetDemo}
          onOpenSuperAdmin={() => {
            setSettingsOpen(false);
            onNavigateAdmin();
          }}
        />
      )}
    </div>
  );
}
