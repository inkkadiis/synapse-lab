import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  where,
  doc,
  getDoc,
  updateDoc,
  QueryDocumentSnapshot,
  DocumentData
} from "firebase/firestore";
import { db } from "../lib/firebase";

export const PAPERS_COLLECTION = "papers";

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  pdfUrl: string;
  publishedAt: any;
  abstract?: string;
  analysis_ko?: {
    summary: string;
    methodology: string;
    experimental_results: string;
    implementation_feasibility: string;
    key_takeaways: string[];
  };
  isAnalyzed: boolean;
  createdAt: any;
  userId: string;
  source?: string;
}

export const fetchPapers = async (
  userId: string, 
  pageSize: number = 10, 
  lastVisible?: QueryDocumentSnapshot<DocumentData>
) => {
  let q = query(
    collection(db, PAPERS_COLLECTION),
    where("userId", "==", userId),
    orderBy("publishedAt", "desc"),
    limit(pageSize)
  );

  if (lastVisible) {
    q = query(q, startAfter(lastVisible));
  }

  const snapshot = await getDocs(q);
  const papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Paper));
  
  return {
    papers,
    lastVisible: snapshot.docs[snapshot.docs.length - 1]
  };
};

export const checkPaperExists = async (userId: string, pdfUrl: string) => {
  const q = query(
    collection(db, PAPERS_COLLECTION),
    where("userId", "==", userId),
    where("pdfUrl", "==", pdfUrl),
    limit(1)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

export const savePaper = async (paperData: Partial<Paper>) => {
  // Check if already exists for this user
  if (paperData.userId && paperData.pdfUrl) {
    const exists = await checkPaperExists(paperData.userId, paperData.pdfUrl);
    if (exists) return null;
  }

  return await addDoc(collection(db, PAPERS_COLLECTION), {
    ...paperData,
    createdAt: serverTimestamp(),
    isAnalyzed: paperData.isAnalyzed ?? false
  });
};

export const updatePaperAnalysis = async (paperId: string, analysis: any) => {
  const paperRef = doc(db, PAPERS_COLLECTION, paperId);
  await updateDoc(paperRef, {
    analysis_ko: analysis,
    isAnalyzed: true
  });
};
