import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, BOOTSTRAP_SUPER_ADMIN_EMAIL, db, googleProvider } from '../firebase';
import { UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrors';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  role: UserRole;
  isSuperAdmin: boolean;
  isBootstrapAdmin: boolean;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<UserRole>('client');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isBootstrapAdmin, setIsBootstrapAdmin] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setRole('client');
        setIsSuperAdmin(false);
        setIsBootstrapAdmin(false);
        setAuthReady(true);
        return;
      }

      try {
        const normalizedEmail = (nextUser.email ?? '').trim().toLowerCase();
        const emailVerified = Boolean(nextUser.emailVerified);
        const bootstrapMatch =
          emailVerified && normalizedEmail === BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase();

        let adminUidMatch = false;
        let adminInviteMatch = false;

        try {
          const adminSnap = await getDoc(doc(db, 'admins', nextUser.uid));
          adminUidMatch = adminSnap.exists();
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `admins/${nextUser.uid}`);
        }

        if (emailVerified && normalizedEmail) {
          try {
            const inviteSnap = await getDoc(doc(db, 'adminInvites', normalizedEmail));
            adminInviteMatch = inviteSnap.exists();
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `adminInvites/${normalizedEmail}`);
          }
        }

        const adminAccess = emailVerified && (bootstrapMatch || adminUidMatch || adminInviteMatch);
        const resolvedRole: UserRole = adminAccess ? 'super_admin' : 'client';

        setIsBootstrapAdmin(bootstrapMatch);
        setIsSuperAdmin(adminAccess);
        setRole(resolvedRole);

        // Sync user profile document strictly when email is verified
        if (emailVerified) {
          const userDocRef = doc(db, 'users', nextUser.uid);
          try {
            const existingSnap = await getDoc(userDocRef);
            const cleanDisplayName = (nextUser.displayName || normalizedEmail || 'User').slice(0, 120);
            const cleanEmail = normalizedEmail.slice(0, 200);

            if (!existingSnap.exists()) {
              await setDoc(userDocRef, {
                uid: nextUser.uid,
                email: cleanEmail,
                displayName: cleanDisplayName,
                role: resolvedRole,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              const currentData = existingSnap.data() as { role?: UserRole };
              if (adminAccess && currentData.role !== 'super_admin') {
                await updateDoc(userDocRef, {
                  email: cleanEmail,
                  displayName: cleanDisplayName,
                  role: 'super_admin',
                  updatedAt: serverTimestamp(),
                });
              } else {
                await updateDoc(userDocRef, {
                  email: cleanEmail,
                  displayName: cleanDisplayName,
                  updatedAt: serverTimestamp(),
                });
              }
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${nextUser.uid}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to verify account permissions.';
        setAuthError(message);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-out failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        role,
        isSuperAdmin,
        isBootstrapAdmin,
        authBusy,
        authError,
        signInWithGoogle,
        signOut,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
