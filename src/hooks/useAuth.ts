import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth } from '../lib/firebase';

const DEBUG_SESSION_KEY = 'synapse_debug_auth';
const DEBUG_UID = 'debug-local-user';

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email?: string | null;
  isDebug?: boolean;
};

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    isDebug: false,
  };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(DEBUG_SESSION_KEY) === '1') {
      setUser({
        uid: DEBUG_UID,
        displayName: 'Local Debug User',
        email: 'debug@local.dev',
        isDebug: true,
      });
      setLoading(false);
      return;
    }

    const loadingTimeout = window.setTimeout(() => {
      setLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? toAuthUser(firebaseUser) : null);
      setLoading(false);
      window.clearTimeout(loadingTimeout);
    });

    return () => {
      window.clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const loginDebug = () => {
    window.localStorage.setItem(DEBUG_SESSION_KEY, '1');
    setUser({
      uid: DEBUG_UID,
      displayName: 'Local Debug User',
      email: 'debug@local.dev',
      isDebug: true,
    });
    setLoading(false);
  };

  const logout = async () => {
    if (user?.isDebug) {
      window.localStorage.removeItem(DEBUG_SESSION_KEY);
      setUser(null);
      return;
    }
    await signOut(auth);
  };

  return { user, loading, login, loginDebug, logout };
}
