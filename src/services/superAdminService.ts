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
import { AdminInvite, ClientAccount, ClientAccountStatus } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrors';

export interface ClientAccountInput {
  businessName: string;
  contactEmail: string;
  status: ClientAccountStatus;
  activeUnits: number;
  monthlySubscriptionFee: number;
  adProgramOptedIn: boolean;
  creditPerUnitMonthly: number;
}

function roundCurrency(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function toMillis(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof ts === 'object' && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export function computeClientBilling(input: {
  activeUnits: number;
  monthlySubscriptionFee: number;
  adProgramOptedIn: boolean;
  creditPerUnitMonthly: number;
}): {
  activeUnits: number;
  monthlySubscriptionFee: number;
  creditPerUnitMonthly: number;
  monthlyCredit: number;
  totalMonthlyBill: number;
} {
  const activeUnits = Math.max(0, Math.min(5000, Math.round(Number(input.activeUnits) || 0)));
  const monthlySubscriptionFee = Math.min(
    1_000_000,
    roundCurrency(Number(input.monthlySubscriptionFee) || 0)
  );
  const creditPerUnitMonthly = Math.min(
    1000,
    roundCurrency(Number(input.creditPerUnitMonthly) || 0)
  );
  const monthlyCredit = input.adProgramOptedIn
    ? Math.min(1_000_000, roundCurrency(activeUnits * creditPerUnitMonthly))
    : 0;
  const totalMonthlyBill = roundCurrency(Math.max(0, monthlySubscriptionFee - monthlyCredit));

  return {
    activeUnits,
    monthlySubscriptionFee,
    creditPerUnitMonthly,
    monthlyCredit,
    totalMonthlyBill,
  };
}

export function subscribeClientAccounts(
  uid: string,
  isBootstrapAdmin: boolean,
  onData: (accounts: ClientAccount[]) => void,
  onError: (err: Error) => void
): () => void {
  const colRef = collection(db, 'clientAccounts');
  const q = isBootstrapAdmin ? query(colRef) : query(colRef, where('createdByUid', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: ClientAccount[] = snapshot.docs.map((d) => {
        const data = d.data() as ClientAccount;
        return {
          ...data,
          id: data.id || d.id,
        };
      });
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'clientAccounts');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createClientAccount(
  uid: string,
  input: ClientAccountInput
): Promise<string> {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const businessName = input.businessName.trim().slice(0, 120);
  if (!businessName) {
    throw new Error('Business Name is required.');
  }
  const contactEmail = input.contactEmail.trim().slice(0, 200);
  const billing = computeClientBilling(input);

  const path = `clientAccounts/${clientId}`;
  try {
    await setDoc(doc(db, 'clientAccounts', clientId), {
      id: clientId,
      businessName,
      contactEmail,
      status: input.status,
      activeUnits: billing.activeUnits,
      monthlySubscriptionFee: billing.monthlySubscriptionFee,
      monthlyCredit: billing.monthlyCredit,
      totalMonthlyBill: billing.totalMonthlyBill,
      adProgramOptedIn: Boolean(input.adProgramOptedIn),
      creditPerUnitMonthly: billing.creditPerUnitMonthly,
      createdByUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return clientId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateClientAccount(
  clientId: string,
  input: ClientAccountInput
): Promise<void> {
  const businessName = input.businessName.trim().slice(0, 120);
  if (!businessName) {
    throw new Error('Business Name is required.');
  }
  const contactEmail = input.contactEmail.trim().slice(0, 200);
  const billing = computeClientBilling(input);

  const path = `clientAccounts/${clientId}`;
  try {
    await updateDoc(doc(db, 'clientAccounts', clientId), {
      businessName,
      contactEmail,
      status: input.status,
      activeUnits: billing.activeUnits,
      monthlySubscriptionFee: billing.monthlySubscriptionFee,
      monthlyCredit: billing.monthlyCredit,
      totalMonthlyBill: billing.totalMonthlyBill,
      adProgramOptedIn: Boolean(input.adProgramOptedIn),
      creditPerUnitMonthly: billing.creditPerUnitMonthly,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteClientAccount(clientId: string): Promise<void> {
  const path = `clientAccounts/${clientId}`;
  try {
    await deleteDoc(doc(db, 'clientAccounts', clientId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeAdminInvites(
  uid: string,
  isBootstrapAdmin: boolean,
  onData: (invites: AdminInvite[]) => void,
  onError: (err: Error) => void
): () => void {
  const colRef = collection(db, 'adminInvites');
  const q = isBootstrapAdmin ? query(colRef) : query(colRef, where('grantedBy', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as AdminInvite);
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'adminInvites');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function addAdminInvite(
  grantedByUid: string,
  rawEmail: string,
  note = ''
): Promise<void> {
  const email = rawEmail.trim().toLowerCase().slice(0, 200);
  if (!/^[^/@\s]+@[^/@\s]+\.[^/@\s]+$/.test(email)) {
    throw new Error('Please enter a valid Google email address.');
  }
  const cleanNote = note.trim().slice(0, 160);
  const path = `adminInvites/${email}`;
  try {
    await setDoc(doc(db, 'adminInvites', email), {
      email,
      ...(cleanNote ? { note: cleanNote } : {}),
      grantedBy: grantedByUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeAdminInvite(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  const path = `adminInvites/${clean}`;
  try {
    await deleteDoc(doc(db, 'adminInvites', clean));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
