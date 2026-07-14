import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA",
  authDomain: "reco-vaswani-license.firebaseapp.com",
  projectId: "reco-vaswani-license",
  storageBucket: "reco-vaswani-license.appspot.com",
  messagingSenderId: "594471668759",
  appId: "1:594471668759:web:fb9f997aa87bd7e866e052"
};

const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);

export const getServerUrlByOfficeId = async (officeId: string): Promise<string | null> => {
  try {
    const q = query(
      collection(firestore, 'serial_keys'), 
      where('office_id', '==', officeId),
      where('key_type', '==', 'server')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      return data.public_url || null;
    }
  } catch (err) {
    console.error("Failed to query server url:", err);
  }
  return null;
};

export const fetchActiveServers = async () => {
  try {
    const q = query(
      collection(firestore, 'serial_keys'), 
      where('is_global', '==', true)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("Failed to fetch active servers:", err);
    return [];
  }
};
