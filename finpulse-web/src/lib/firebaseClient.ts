import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { safeApiFetch } from "./api";

const firebaseConfig = {
  apiKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) || "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA",
  authDomain: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) || "reco-vaswani-license.firebaseapp.com",
  projectId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID) || "reco-vaswani-license",
  storageBucket: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) || "reco-vaswani-license.appspot.com",
  messagingSenderId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) || "594471668759",
  appId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_ID) || "1:594471668759:web:fb9f997aa87bd7e866e052"
};

const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);

export const getServerUrlByOfficeId = async (officeId: string): Promise<string | null> => {
  try {
    const res = await safeApiFetch(`/api/network/servers?office_id=${encodeURIComponent(officeId)}`);
    if (res && res.ok) {
      const data = await res.json();
      return data.public_url || null;
    }
  } catch (err) {
    console.error("Failed to query server url via backend proxy:", err);
  }
  return null;
};

export const fetchActiveServers = async () => {
  try {
    const res = await safeApiFetch('/api/network/servers?is_global=true');
    if (res && res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error("Failed to fetch active servers via backend proxy:", err);
  }
  return [];
};
