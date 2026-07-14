import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA",
  authDomain: "reco-vaswani-license.firebaseapp.com",
  projectId: "reco-vaswani-license",
  storageBucket: "reco-vaswani-license.appspot.com",
  messagingSenderId: "594471668759",
  appId: "1:594471668759:web:fb9f997aa87bd7e866e052"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const defaultModules = ['TallyConverter', 'Consolidator', 'RecoEngine', 'OCR', 'Returns', 'Dashboard', 'TallyDirect', 'Tracker', 'FinStatements', 'Forensic'];

async function sync() {
    const officesSnap = await getDocs(collection(db, "offices"));
    for (let o of officesSnap.docs) {
        const officeId = o.id;
        for (let mod of defaultModules) {
            await setDoc(doc(db, 'module_usage', `${officeId}_${mod}`), { 
                name: mod, is_enabled: 1, usage_count: 0, office_id: officeId, module_name: mod
            }, { merge: true });
            console.log(`Synced ${officeId}_${mod}`);
        }
    }
    console.log("Done");
    process.exit(0);
}
sync();
