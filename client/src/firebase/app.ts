import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth, signInAnonymously, type Auth, type User } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  }
}

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const optionalConfig = {
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

const missingKeys = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isFirebaseConfigured = missingKeys.length === 0;
export const isAppCheckEnabled = import.meta.env.VITE_ENABLE_APPCHECK === 'true';

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let database: Database | null = null;
let appCheckInstance: AppCheck | null = null;
let authPromise: Promise<User> | null = null;

function getOrCreateFirebaseApp() {
  if (!isFirebaseConfigured) {
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = initializeApp({
      ...requiredConfig,
      ...optionalConfig,
    });
  }

  return firebaseApp;
}

export function getFirebaseAuth() {
  const app = getOrCreateFirebaseApp();
  if (!app) {
    return null;
  }

  if (!auth) {
    auth = getAuth(app);
  }

  return auth;
}

export function getFirebaseDatabase() {
  const app = getOrCreateFirebaseApp();
  if (!app) {
    return null;
  }

  if (!database) {
    database = getDatabase(app);
  }

  return database;
}

function resolveDebugToken(value: string | undefined): boolean | string | undefined {
  if (!value) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  return value;
}

function initializeFirebaseAppCheck() {
  if (!isFirebaseConfigured || !isAppCheckEnabled || appCheckInstance) {
    return;
  }

  const app = getOrCreateFirebaseApp();
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
  const debugToken = resolveDebugToken(
    import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN,
  );

  if (!app || !siteKey) {
    return;
  }

  if (debugToken !== undefined && typeof window !== 'undefined') {
    window.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export async function ensureAnonymousAuth(): Promise<User> {
  if (!isFirebaseConfigured) {
    throw new Error(
      `Firebase 尚未設定完成，缺少: ${missingKeys.join(', ')}`,
    );
  }

  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    throw new Error('Firebase 初始化失敗。');
  }

  initializeFirebaseAppCheck();

  if (authInstance.currentUser) {
    return authInstance.currentUser;
  }

  if (!authPromise) {
    authPromise = signInAnonymously(authInstance).then((credential) => credential.user);
  }

  return authPromise;
}
