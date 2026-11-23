import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  Database,
  LogIn,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SEED_PORTAL_STATE } from '../data/seedData';
import { BOOTSTRAP_SUPER_ADMIN_EMAIL } from '../firebase';
import {
  clientTablesToPortalState,
  fetchClientTablesFromFirestore,
  slugifyClientId,
  syncClientTablesToFirestore,
} from '../services/clientTablesService';
import {
  deleteNetworkAd,
  isStockNetworkAd,
  subscribeAdminNetworkAds,
  syncNetworkAdsToServer,
} from '../services/networkAdsService';
import {
  addAdminInvite,
  ClientAccountInput,
  computeClientBilling,
  createClientAccount,
  deleteClientAccount,
  removeAdminInvite,
  subscribeAdminInvites,
  subscribeClientAccounts,
  updateClientAccount,
} from '../services/superAdminService';
import {
  AdminInvite,
  AdminNetworkAd,
  ClientAccount,
  ClientAccountStatus,
  ClientPortalTablesBundle,
  PortalState,
} from '../types';
import { fetchPublishedState, publishPortalState } from '../utils/publishSync';
import { loadPortalState, savePortalState } from '../utils/storage';
import { ClientTablesModal } from './ClientTablesModal';
import { SuperAdminAdNetworkPanel } from './SuperAdminAdNetworkPanel';

interface SuperAdminDashboardProps {
  onNavigatePortal: () => void;
  onOpenClientInPortal?: (portalState: PortalState, clientId: string) => void;
}

const DEFAULT_FEE_PER_UNIT = 15;
const DEFAULT_CREDIT_PER_UNIT = 1;

const EMPTY_CLIENT_FORM: ClientAccountInput & { syncFeeFromUnits: boolean } = {
  businessName: '',
  contactEmail: '',
  status: 'active',
  activeUnits: 12,
  monthlySubscriptionFee: 12 * DEFAULT_FEE_PER_UNIT,
  adProgramOptedIn: true,
  creditPerUnitMonthly: DEFAULT_CREDIT_PER_UNIT,
  syncFeeFromUnits: true,
};

const STATUS_LABELS: Record<ClientAccountStatus, { label: string; colorClass: string }> = {
  active: { label: 'Active', colorClass: 'text-emerald-700' },
  onboarding: { label: 'Onboarding', colorClass: 'text-amber-700' },
  paused: { label: 'Paused', colorClass: 'text-slate-400' },
};

function normalizeVenueKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onNavigatePortal,
  onOpenClientInPortal,
}) => {
  const {
    user,
    authReady,
    isSuperAdmin,
    isBootstrapAdmin,
    authBusy,
    authError,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const [adminView, setAdminView] = useState<'accounts' | 'ad-network'>('accounts');
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [networkAds, setNetworkAds] = useState<AdminNetworkAd[]>([]);
  const [loadingNetworkAds, setLoadingNetworkAds] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncingPortalVenue, setSyncingPortalVenue] = useState(false);

  const [portalSnapshot, setPortalSnapshot] = useState<PortalState>(() => loadPortalState());
  const [publishedSnapshot, setPublishedSnapshot] = useState<PortalState | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientAccountStatus>('all');

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [formState, setFormState] = useState(EMPTY_CLIENT_FORM);
  const [savingClient, setSavingClient] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [savingInvite, setSavingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [tablesModalOpen, setTablesModalOpen] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tablesBundle, setTablesBundle] = useState<ClientPortalTablesBundle | null>(null);
  const [tablesClientName, setTablesClientName] = useState<string>('');

  useEffect(() => {
    let active = true;
    const local = loadPortalState();
    setPortalSnapshot(local);

    void fetchPublishedState().then((published) => {
      if (!active || !published?.state) return;
      setPublishedSnapshot(published.state);
      const localIsSeed =
        local.venue.name === SEED_PORTAL_STATE.venue.name &&
        local.promotions.length === SEED_PORTAL_STATE.promotions.length;
      const publishedIsCustom = published.state.venue.name !== SEED_PORTAL_STATE.venue.name;
      if (localIsSeed && publishedIsCustom) {
        setPortalSnapshot(published.state);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user || !isSuperAdmin) {
      setAccounts([]);
      setInvites([]);
      setNetworkAds([]);
      setLoadingAccounts(false);
      setLoadingNetworkAds(false);
      return;
    }

    setLoadingAccounts(true);
    setLoadingNetworkAds(true);
    setDataError(null);

    const unsubAccounts = subscribeClientAccounts(
      user.uid,
      isBootstrapAdmin,
      (rows) => {
        setAccounts(rows);
        setLoadingAccounts(false);
      },
      (err) => {
        setDataError(err.message);
        setLoadingAccounts(false);
      }
    );

    const unsubInvites = subscribeAdminInvites(
      user.uid,
      isBootstrapAdmin,
      (rows) => {
        setInvites(rows);
      },
      (err) => {
        setDataError(err.message);
      }
    );

    const unsubNetworkAds = subscribeAdminNetworkAds(
      user.uid,
      isBootstrapAdmin,
      (rows) => {
        const stockRows = rows.filter((ad) => isStockNetworkAd(ad));
        if (stockRows.length > 0) {
          stockRows.forEach((ad) => {
            void deleteNetworkAd(ad.id).catch(() => null);
          });
        }
        const uploadedRows = rows.filter((ad) => !isStockNetworkAd(ad));
        setNetworkAds(uploadedRows);
        setLoadingNetworkAds(false);
        void syncNetworkAdsToServer(uploadedRows);
      },
      (err) => {
        setDataError(err.message);
        setLoadingNetworkAds(false);
      }
    );

    return () => {
      unsubAccounts();
      unsubInvites();
      unsubNetworkAds();
    };
  }, [authReady, user, isSuperAdmin, isBootstrapAdmin]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      const matchesStatus = statusFilter === 'all' || acc.status === statusFilter;
      const matchesQuery =
        !q ||
        acc.businessName.toLowerCase().includes(q) ||
        acc.contactEmail.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [accounts, searchQuery, statusFilter]);

  const totals = useMemo(() => {
    return accounts.reduce(
      (acc, client) => {
        acc.totalClients += 1;
        if (client.status === 'active') acc.activeClients += 1;
        acc.totalUnits += client.activeUnits || 0;
        acc.totalSubscription += client.monthlySubscriptionFee || 0;
        acc.totalCredit += client.monthlyCredit || 0;
        acc.totalBill += client.totalMonthlyBill || 0;
        return acc;
      },
      {
        totalClients: 0,
        activeClients: 0,
        totalUnits: 0,
        totalSubscription: 0,
        totalCredit: 0,
        totalBill: 0,
      }
    );
  }, [accounts]);

  const openCreateModal = () => {
    setEditingClientId(null);
    setFormState(EMPTY_CLIENT_FORM);
    setFormError(null);
    setClientModalOpen(true);
  };

  const openEditModal = (client: ClientAccount) => {
    setEditingClientId(client.id);
    setFormState({
      businessName: client.businessName,
      contactEmail: client.contactEmail,
      status: client.status,
      activeUnits: client.activeUnits,
      monthlySubscriptionFee: client.monthlySubscriptionFee,
      adProgramOptedIn: client.adProgramOptedIn,
      creditPerUnitMonthly: client.creditPerUnitMonthly ?? DEFAULT_CREDIT_PER_UNIT,
      syncFeeFromUnits:
        Math.abs(client.monthlySubscriptionFee - client.activeUnits * DEFAULT_FEE_PER_UNIT) < 0.01,
    });
    setFormError(null);
    setClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setSavingClient(true);

    try {
      const payload: ClientAccountInput = {
        businessName: formState.businessName,
        contactEmail: formState.contactEmail,
        status: formState.status,
        activeUnits: formState.activeUnits,
        monthlySubscriptionFee: formState.monthlySubscriptionFee,
        adProgramOptedIn: formState.adProgramOptedIn,
        creditPerUnitMonthly: formState.creditPerUnitMonthly,
      };

      if (editingClientId) {
        await updateClientAccount(editingClientId, payload);
      } else {
        await createClientAccount(user.uid, payload);
      }
      setClientModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save client account.');
    } finally {
      setSavingClient(false);
    }
  };

  const handleSetClientAdParticipation = async (
    client: ClientAccount,
    nextOptedIn: boolean
  ) => {
    setDataError(null);
    try {
      await updateClientAccount(client.id, {
        businessName: client.businessName,
        contactEmail: client.contactEmail,
        status: client.status,
        activeUnits: client.activeUnits,
        monthlySubscriptionFee: client.monthlySubscriptionFee,
        adProgramOptedIn: nextOptedIn,
        creditPerUnitMonthly: client.creditPerUnitMonthly || DEFAULT_CREDIT_PER_UNIT,
      });

      const clientKey = normalizeVenueKey(client.businessName);
      const latestLocal = loadPortalState();
      if (
        latestLocal.venue.clientId === client.id ||
        normalizeVenueKey(latestLocal.venue.name) === clientKey
      ) {
        const updatedLocal: PortalState = {
          ...latestLocal,
          venue: {
            ...latestLocal.venue,
            clientId: client.id,
          },
          adMonetization: {
            ...latestLocal.adMonetization,
            optedIn: nextOptedIn,
          },
        };
        savePortalState(updatedLocal);
        setPortalSnapshot(updatedLocal);
      }

      if (
        publishedSnapshot &&
        (publishedSnapshot.venue.clientId === client.id ||
          normalizeVenueKey(publishedSnapshot.venue.name) === clientKey)
      ) {
        const updatedPublished: PortalState = {
          ...publishedSnapshot,
          venue: {
            ...publishedSnapshot.venue,
            clientId: client.id,
          },
          adMonetization: {
            ...publishedSnapshot.adMonetization,
            optedIn: nextOptedIn,
          },
        };
        const res = await publishPortalState(updatedPublished);
        setPublishedSnapshot(res.resolvedState);
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to update client ad credit.');
    }
  };

  const handleQuickToggleAdCredit = async (client: ClientAccount) => {
    await handleSetClientAdParticipation(client, !client.adProgramOptedIn);
  };

  const handleDeleteClient = async (clientId: string) => {
    setDataError(null);
    try {
      await deleteClientAccount(clientId);
      setConfirmDeleteId(null);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to delete client account.');
    }
  };

  const handleAddInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setInviteError(null);
    setSavingInvite(true);
    try {
      await addAdminInvite(user.uid, inviteEmail, inviteNote);
      setInviteEmail('');
      setInviteNote('');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Unable to authorize Super Admin.');
    } finally {
      setSavingInvite(false);
    }
  };

  const portalVenueSlug = slugifyClientId(portalSnapshot.venue.name);
  const matchingPortalAccount = useMemo(() => {
    const targetKey = normalizeVenueKey(portalSnapshot.venue.name);
    return accounts.find(
      (acc) =>
        acc.id === portalVenueSlug || normalizeVenueKey(acc.businessName) === targetKey
    );
  }, [accounts, portalVenueSlug, portalSnapshot.venue.name]);

  const findMatchingPortalStateForClient = (client: ClientAccount): PortalState | null => {
    const clientKey = normalizeVenueKey(client.businessName);
    const latestLocal = loadPortalState();
    if (normalizeVenueKey(latestLocal.venue.name) === clientKey) {
      return latestLocal;
    }
    if (normalizeVenueKey(portalSnapshot.venue.name) === clientKey) {
      return portalSnapshot;
    }
    if (publishedSnapshot && normalizeVenueKey(publishedSnapshot.venue.name) === clientKey) {
      return publishedSnapshot;
    }
    return null;
  };

  const handleSyncPortalVenueToBackend = async (
    targetClientId?: string,
    overridePortalState?: PortalState,
    preserveExistingBilling = false
  ) => {
    if (!user) return;
    setDataError(null);
    setSyncNotice(null);
    setSyncingPortalVenue(true);
    try {
      const latestPortal = loadPortalState();
      const effectivePortal =
        overridePortalState ||
        (latestPortal.venue.name === SEED_PORTAL_STATE.venue.name &&
        portalSnapshot.venue.name !== SEED_PORTAL_STATE.venue.name
          ? portalSnapshot
          : latestPortal);

      const resolvedTargetId =
        targetClientId || matchingPortalAccount?.id || portalVenueSlug;
      const targetAccount = accounts.find((a) => a.id === resolvedTargetId);

      const result = await syncClientTablesToFirestore({
        uid: user.uid,
        userEmail: user.email ?? '',
        isAdmin: true,
        isBootstrapAdmin,
        clientId: resolvedTargetId,
        contactEmail: targetAccount?.contactEmail ?? matchingPortalAccount?.contactEmail ?? user.email ?? '',
        status: targetAccount?.status ?? matchingPortalAccount?.status ?? 'active',
        portalState: effectivePortal,
        preserveExistingBilling,
      });

      savePortalState(result.resolvedPortalState);
      setPortalSnapshot(result.resolvedPortalState);
      setSyncNotice(
        `Synced "${result.resolvedPortalState.venue.name}" to Firestore: ${result.counts.promotions} promos, ${result.counts.mediaAssets} media assets, ${result.counts.menuItems} menu items, ${result.counts.specials} specials.`
      );

      if (tablesModalOpen && selectedClient?.id === result.clientId) {
        const refreshedBundle = await fetchClientTablesFromFirestore({
          clientId: result.clientId,
          uid: user.uid,
          userEmail: user.email ?? '',
          isBootstrapAdmin,
        });
        setTablesBundle(refreshedBundle);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to sync venue tables to Firestore.';
      setDataError(msg);
      if (tablesModalOpen) {
        setTablesError(msg);
      }
    } finally {
      setSyncingPortalVenue(false);
    }
  };

  const handleOpenTablesModal = async (client: ClientAccount) => {
    if (!user) return;
    setSelectedClient(client);
    setTablesClientName(client.businessName);
    setTablesBundle(null);
    setTablesError(null);
    setTablesLoading(true);
    setTablesModalOpen(true);

    try {
      let bundle = await fetchClientTablesFromFirestore({
        clientId: client.id,
        uid: user.uid,
        userEmail: user.email ?? '',
        isBootstrapAdmin,
      });

      const isBundleEmpty =
        bundle.promotions.length === 0 &&
        bundle.mediaAssets.length === 0 &&
        bundle.menuItems.length === 0 &&
        bundle.specials.length === 0;

      const matchingPortal = findMatchingPortalStateForClient(client);
      const portalHasContent =
        matchingPortal &&
        (matchingPortal.promotions.length > 0 ||
          matchingPortal.menuItems.length > 0 ||
          matchingPortal.specials.length > 0);

      if (isBundleEmpty && matchingPortal && portalHasContent) {
        const syncResult = await syncClientTablesToFirestore({
          uid: user.uid,
          userEmail: user.email ?? '',
          isAdmin: true,
          isBootstrapAdmin,
          clientId: client.id,
          contactEmail: client.contactEmail,
          status: client.status,
          portalState: matchingPortal,
          preserveExistingBilling: true,
        });
        savePortalState(syncResult.resolvedPortalState);
        setPortalSnapshot(syncResult.resolvedPortalState);
        bundle = await fetchClientTablesFromFirestore({
          clientId: client.id,
          uid: user.uid,
          userEmail: user.email ?? '',
          isBootstrapAdmin,
        });
      }

      setTablesBundle(bundle);
    } catch (err) {
      setTablesError(
        err instanceof Error ? err.message : 'Unable to load client backend tables.'
      );
    } finally {
      setTablesLoading(false);
    }
  };

  const handleLoadBundleIntoPortal = (bundle: ClientPortalTablesBundle) => {
    const rawPortalState = clientTablesToPortalState(bundle);
    const nextPortalState: PortalState = {
      ...rawPortalState,
      venue: {
        ...rawPortalState.venue,
        clientId: bundle.account.id,
      },
    };
    savePortalState(nextPortalState);
    setTablesModalOpen(false);
    if (onOpenClientInPortal) {
      onOpenClientInPortal(nextPortalState, bundle.account.id);
    } else {
      onNavigatePortal();
    }
  };

  const liveModalBilling = computeClientBilling(formState);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Checking Super Admin session...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between">
          <div className="flex items-baseline gap-2.5">
            <span className="text-lg font-display font-bold tracking-tight text-slate-900">
              Tabletop Studio
            </span>
            <span className="text-xs font-medium text-slate-500">Super Admin</span>
          </div>
          <button
            type="button"
            onClick={onNavigatePortal}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Client Portal
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm space-y-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-700">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                Super Admin Authentication
              </div>
              <h1 className="text-xl font-semibold text-slate-900">
                Sign in to Super Admin Dashboard
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Manage client venue accounts, active tabletop units, monthly subscription fees, and ad spend credits.
              </p>
            </div>

            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={authBusy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              {authBusy ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between">
          <div className="flex items-baseline gap-2.5">
            <span className="text-lg font-display font-bold tracking-tight text-slate-900">
              Tabletop Studio
            </span>
            <span className="text-xs font-medium text-slate-500">Super Admin</span>
          </div>
          <button
            type="button"
            onClick={onNavigatePortal}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Client Portal
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm space-y-4">
            <h1 className="text-lg font-semibold text-slate-900">Super Admin Access Required</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Signed in as <span className="font-medium text-slate-900">{user.email}</span>. This account is not currently authorized for the Super Admin dashboard.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ask an existing Super Admin ({BOOTSTRAP_SUPER_ADMIN_EMAIL}) to add your Google email under Super Admin Access, or sign in with an authorized Super Admin account.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={authBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Switch Google Account
              </button>
              <button
                type="button"
                onClick={onNavigatePortal}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Client Portal
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Tabletop Studio
          </span>
          <span className="text-xs font-medium text-amber-700 whitespace-nowrap">
            Super Admin Dashboard
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setAccessModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Super Admin Access</span>
            <span className="sm:hidden">Admins</span>
          </button>

          <button
            type="button"
            onClick={onNavigatePortal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Client Portal</span>
            <span className="sm:hidden">Portal</span>
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            title={`Signed in as ${user.email}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
        {/* Account Identity Line & Admin Navigation */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {adminView === 'accounts'
                  ? 'Client Accounts & Billing'
                  : 'Super Admin Ad Network'}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {adminView === 'accounts'
                  ? 'Overview of all client venues you have provisioned, active tabletop units, subscription fees, and monthly ad spend credits.'
                  : 'Upload 9:16 sponsored creatives, link campaigns to specific or all client accounts, and control client Ad Network enrollment.'}
              </p>
            </div>
            <div className="text-xs text-slate-500">
              <span>Signed in as </span>
              <span className="font-medium text-slate-800">{user.email}</span>
            </div>
          </div>

          <div className="border-b border-slate-200 flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setAdminView('accounts')}
              className={`py-2.5 border-b-2 transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                adminView === 'accounts'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" aria-hidden="true" />
              Client Accounts
              <span className="text-xs font-mono tabular-nums text-slate-400">
                ({accounts.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAdminView('ad-network')}
              className={`py-2.5 border-b-2 transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                adminView === 'ad-network'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Megaphone className="w-4 h-4" aria-hidden="true" />
              Ad Network
              <span className="text-xs font-mono tabular-nums text-slate-400">
                ({networkAds.length})
              </span>
            </button>
          </div>
        </div>

        {dataError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {dataError}
          </div>
        )}

        {syncNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex items-center justify-between gap-3">
            <span>{syncNotice}</span>
            <button
              type="button"
              onClick={() => setSyncNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 shrink-0"
              aria-label="Dismiss sync notification"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {adminView === 'ad-network' ? (
          <SuperAdminAdNetworkPanel
            uid={user.uid}
            ads={networkAds}
            loading={loadingNetworkAds}
            clients={accounts}
            onToggleClientJoin={handleSetClientAdParticipation}
          />
        ) : (
          <>

        {!loadingAccounts && !matchingPortalAccount && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">
                Current Portal Venue Ready to Save: {portalSnapshot.venue.name}
              </p>
              <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                {portalSnapshot.promotions.length} promotions · {portalSnapshot.categories.length}{' '}
                menu categories · {portalSnapshot.menuItems.length} menu items ·{' '}
                {portalSnapshot.specials.length} daily specials ·{' '}
                {portalSnapshot.adMonetization.optedIn ? 'Ad Network Opted In' : 'Ad Network Opted Out'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSyncPortalVenueToBackend()}
              disabled={syncingPortalVenue}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-amber-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              {syncingPortalVenue
                ? 'Saving Tables...'
                : `Import ${portalSnapshot.venue.name} Tables`}
            </button>
          </div>
        )}

        {/* Quantitative Summary Ledger */}
        <section
          aria-label="Portfolio Billing Summary"
          className="rounded-xl border border-slate-200 bg-white grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden"
        >
          <div className="p-4">
            <span className="text-xs text-slate-500">Client Accounts</span>
            <div className="mt-1 text-xl font-semibold font-mono text-slate-900 tabular-nums">
              {totals.totalClients}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {totals.activeClients} active venues
            </p>
          </div>

          <div className="p-4">
            <span className="text-xs text-slate-500">Active Tabletop Units</span>
            <div className="mt-1 text-xl font-semibold font-mono text-slate-900 tabular-nums">
              {totals.totalUnits} units
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Across all client tables</p>
          </div>

          <div className="p-4">
            <span className="text-xs text-slate-500">Monthly Subscription Fees</span>
            <div className="mt-1 text-xl font-semibold font-mono text-slate-900 tabular-nums">
              ${totals.totalSubscription.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Gross monthly fees</p>
          </div>

          <div className="p-4">
            <span className="text-xs text-slate-500">Monthly Ad Spend Credits</span>
            <div className="mt-1 text-xl font-semibold font-mono text-emerald-700 tabular-nums">
              −${totals.totalCredit.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Partner ad spend offset</p>
          </div>

          <div className="p-4 col-span-2 sm:col-span-1">
            <span className="text-xs text-slate-500">Total Monthly Billing</span>
            <div className="mt-1 text-xl font-semibold font-mono text-slate-900 tabular-nums">
              ${totals.totalBill.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Net monthly bill</p>
          </div>
        </section>

        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search business name or email..."
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70">
              {(['all', 'active', 'onboarding', 'paused'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleSyncPortalVenueToBackend()}
              disabled={syncingPortalVenue}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncingPortalVenue ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {syncingPortalVenue
                ? 'Syncing Venue...'
                : `Sync "${portalSnapshot.venue.name}"`}
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              New Client Account
            </button>
          </div>
        </div>

        {/* Client Account Widgets */}
        {loadingAccounts ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
            Loading client accounts...
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center space-y-3">
            <Building2 className="w-7 h-7 mx-auto text-slate-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {accounts.length === 0
                  ? 'No client accounts created yet'
                  : 'No client accounts match your filter'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {accounts.length === 0
                  ? 'Create your first client venue account to track active tabletop units, monthly subscription fees, ad spend credits, and total monthly billing.'
                  : 'Try clearing your search query or switching the status filter.'}
              </p>
            </div>
            {accounts.length === 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Create First Client Account
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAccounts.map((client) => {
              const statusMeta = STATUS_LABELS[client.status] ?? STATUS_LABELS.active;
              const isDeleting = confirmDeleteId === client.id;
              const isSelected = selectedClient?.id === client.id && tablesModalOpen;

              return (
                <article
                  key={client.id}
                  onClick={() => void handleOpenTablesModal(client)}
                  className={`rounded-xl border bg-white flex flex-col justify-between overflow-hidden cursor-pointer transition-all hover:border-amber-500/80 hover:shadow-sm ${
                    isSelected
                      ? 'border-amber-600 ring-1 ring-amber-600/20'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Card Header: Business Name & Status */}
                  <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-900 truncate">
                        {client.businessName}
                      </h2>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {client.contactEmail || 'No contact email set'}
                      </p>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${statusMeta.colorClass}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Required Client Billing & Unit Widget Metrics */}
                  <dl className="px-5 py-4 space-y-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-slate-500">Active Table Top Units</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                        {client.activeUnits} units
                      </dd>
                    </div>

                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-slate-500">Monthly Subscription Fee</dt>
                      <dd className="font-mono font-medium text-slate-900 tabular-nums">
                        ${client.monthlySubscriptionFee.toFixed(2)}/mo
                      </dd>
                    </div>

                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-slate-500">Monthly Credit (Ad Spend)</dt>
                      <dd
                        className={`font-mono font-medium tabular-nums ${
                          client.adProgramOptedIn && client.monthlyCredit > 0
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {client.adProgramOptedIn && client.monthlyCredit > 0
                          ? `−$${client.monthlyCredit.toFixed(2)}/mo`
                          : '$0.00/mo'}
                      </dd>
                    </div>

                    <div className="pt-2.5 border-t border-slate-200 flex items-baseline justify-between gap-3">
                      <dt className="text-xs font-semibold text-slate-800">Total Monthly Bill</dt>
                      <dd className="text-base font-mono font-bold text-slate-900 tabular-nums">
                        ${client.totalMonthlyBill.toFixed(2)}/mo
                      </dd>
                    </div>
                  </dl>

                  {/* Card Footer Actions */}
                  <div
                    className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => void handleQuickToggleAdCredit(client)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                    >
                      {client.adProgramOptedIn ? 'Ad Credit Active' : 'Enable Ad Credit'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleOpenTablesModal(client)}
                        title="View client images, promotions, schedule, and info"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-50 whitespace-nowrap"
                      >
                        <Database className="w-3.5 h-3.5" aria-hidden="true" />
                        Images & Promos
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(client)}
                        title="Edit client account"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 whitespace-nowrap"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        Edit
                      </button>

                      {isDeleting ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDeleteClient(client.id)}
                            className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:text-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(client.id)}
                          title="Delete client account"
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
          </>
        )}
      </main>

      {/* Create / Edit Client Account Modal */}
      {clientModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-modal-title"
          onClick={() => setClientModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="client-modal-title" className="text-base font-semibold text-slate-900">
                {editingClientId ? 'Edit Client Account' : 'New Client Account'}
              </h2>
              <button
                type="button"
                onClick={() => setClientModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveClient(e)} className="p-5 space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Business Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formState.businessName}
                  onChange={(e) => setFormState({ ...formState, businessName: e.target.value })}
                  placeholder="e.g. The Copper & Oak"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Contact Email (optional)
                  </label>
                  <input
                    type="email"
                    maxLength={200}
                    value={formState.contactEmail}
                    onChange={(e) => setFormState({ ...formState, contactEmail: e.target.value })}
                    placeholder="owner@venue.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Account Status
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        status: e.target.value as ClientAccountStatus,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Active Table Top Units
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    required
                    value={formState.activeUnits}
                    onChange={(e) => {
                      const units = Math.max(0, Math.min(5000, Math.round(Number(e.target.value) || 0)));
                      setFormState((prev) => ({
                        ...prev,
                        activeUnits: units,
                        monthlySubscriptionFee: prev.syncFeeFromUnits
                          ? units * DEFAULT_FEE_PER_UNIT
                          : prev.monthlySubscriptionFee,
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-600">
                      Monthly Subscription Fee ($)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState((prev) => ({
                          ...prev,
                          syncFeeFromUnits: true,
                          monthlySubscriptionFee: prev.activeUnits * DEFAULT_FEE_PER_UNIT,
                        }))
                      }
                      className="text-[11px] font-medium text-amber-700 hover:underline"
                    >
                      $15/unit
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step="0.01"
                    required
                    value={formState.monthlySubscriptionFee}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        syncFeeFromUnits: false,
                        monthlySubscriptionFee: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.adProgramOptedIn}
                      onChange={(e) =>
                        setFormState({ ...formState, adProgramOptedIn: e.target.checked })
                      }
                      className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                    />
                    Apply Monthly Ad Spend Credit
                  </label>

                  {formState.adProgramOptedIn && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Credit / Unit ($):</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step="0.25"
                        value={formState.creditPerUnitMonthly}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            creditPerUnitMonthly: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Monthly Subscription Fee</span>
                    <span className="font-mono tabular-nums">
                      ${liveModalBilling.monthlySubscriptionFee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Monthly Credit (Ad Spend)</span>
                    <span className="font-mono tabular-nums">
                      −${liveModalBilling.monthlyCredit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900 pt-1">
                    <span>Total Monthly Bill</span>
                    <span className="font-mono tabular-nums">
                      ${liveModalBilling.totalMonthlyBill.toFixed(2)}/mo
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setClientModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingClient}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {savingClient
                    ? 'Saving...'
                    : editingClientId
                      ? 'Save Client Account'
                      : 'Create Client Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Team Access Modal */}
      {accessModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-access-title"
          onClick={() => setAccessModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="admin-access-title" className="text-base font-semibold text-slate-900">
                Authorized Super Admins
              </h2>
              <button
                type="button"
                onClick={() => setAccessModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Authorize another Google account to sign in and manage their own client venue accounts on the Super Admin dashboard.
              </p>

              <form onSubmit={(e) => void handleAddInvite(e)} className="space-y-2.5">
                {inviteError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {inviteError}
                  </div>
                )}
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="partner@gmail.com"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={160}
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                    placeholder="Role / note (optional)"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingInvite}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap disabled:opacity-60"
                  >
                    {savingInvite ? 'Adding...' : 'Grant Access'}
                  </button>
                </div>
              </form>

              <div className="rounded-lg border border-slate-200 divide-y divide-slate-200 max-h-56 overflow-y-auto">
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate">
                      {BOOTSTRAP_SUPER_ADMIN_EMAIL}
                    </div>
                    <div className="text-[11px] text-slate-500">Primary Super Admin</div>
                  </div>
                </div>

                {invites.map((inv) => (
                  <div
                    key={inv.email}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate">{inv.email}</div>
                      {inv.note && (
                        <div className="text-[11px] text-slate-500 truncate">{inv.note}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeAdminInvite(inv.email)}
                      className="text-xs text-red-600 hover:underline shrink-0"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Client Backend Tables Inspector Modal */}
      {tablesModalOpen && (
        <ClientTablesModal
          bundle={tablesBundle}
          loading={tablesLoading}
          error={tablesError}
          clientNameFallback={tablesClientName}
          canSyncFromPortal={Boolean(
            selectedClient && findMatchingPortalStateForClient(selectedClient)
          )}
          syncingFromPortal={syncingPortalVenue}
          localPortalCounts={
            selectedClient
              ? (() => {
                  const matched = findMatchingPortalStateForClient(selectedClient);
                  return matched
                    ? {
                        promotions: matched.promotions.length,
                        menuItems: matched.menuItems.length,
                        specials: matched.specials.length,
                      }
                    : undefined;
                })()
              : undefined
          }
          onSyncFromPortal={() => {
            if (!selectedClient) return;
            const matched = findMatchingPortalStateForClient(selectedClient);
            if (matched) {
              void handleSyncPortalVenueToBackend(selectedClient.id, matched, true);
            }
          }}
          onClose={() => {
            setTablesModalOpen(false);
            setSelectedClient(null);
          }}
          onLoadIntoPortal={handleLoadBundleIntoPortal}
        />
      )}
    </div>
  );
};
