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
  updateDoc,
  QueryDocumentSnapshot,
  DocumentData
} from "firebase/firestore";
import { db } from "../lib/firebase";

export const PAPERS_COLLECTION = "papers";
const DEBUG_USER_ID = "debug-local-user";
const DEBUG_PAPERS_KEY = "synapse_debug_papers";

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
  analyzedAt?: any;
  createdAt: any;
  userId: string;
  source?: string;
}

type DebugPaperRecord = Paper & {
  publishedAtMs: number;
  createdAtMs: number;
  analyzedAtMs?: number;
};

const isDebugUser = (userId?: string) => userId === DEBUG_USER_ID;

const toTimestampLike = (ms: number) => ({
  toDate: () => new Date(ms),
});

const toDebugPaper = (paper: DebugPaperRecord): Paper => ({
  ...paper,
  publishedAt: toTimestampLike(paper.publishedAtMs),
  createdAt: toTimestampLike(paper.createdAtMs),
  analyzedAt: paper.analyzedAtMs ? toTimestampLike(paper.analyzedAtMs) : undefined,
});

const getDebugPaperRecords = () => {
  const raw = window.localStorage.getItem(DEBUG_PAPERS_KEY);
  if (!raw) return [] as DebugPaperRecord[];

  try {
    return JSON.parse(raw) as DebugPaperRecord[];
  } catch {
    return [] as DebugPaperRecord[];
  }
};

const setDebugPaperRecords = (papers: DebugPaperRecord[]) => {
  window.localStorage.setItem(DEBUG_PAPERS_KEY, JSON.stringify(papers));
};

export const fetchPapers = async (
  userId: string, 
  pageSize: number = 10, 
  lastVisible?: QueryDocumentSnapshot<DocumentData>
) => {
  if (isDebugUser(userId)) {
    const papers = getDebugPaperRecords()
      .filter((paper) => paper.userId === userId)
      .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
      .slice(0, pageSize)
      .map(toDebugPaper);

    return {
      papers,
      lastVisible: undefined,
    };
  }

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
  if (isDebugUser(userId)) {
    return getDebugPaperRecords().some((paper) => paper.userId === userId && paper.pdfUrl === pdfUrl);
  }

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

  if (isDebugUser(paperData.userId)) {
    const now = Date.now();
    const record: DebugPaperRecord = {
      id: `debug-${now}-${Math.floor(Math.random() * 10000)}`,
      title: paperData.title || "Untitled Paper",
      authors: paperData.authors || [],
      pdfUrl: paperData.pdfUrl || "",
      publishedAt: toTimestampLike(now),
      publishedAtMs:
        typeof paperData.publishedAt?.toDate === "function"
          ? paperData.publishedAt.toDate().getTime()
          : now,
      abstract: paperData.abstract,
      analysis_ko: paperData.analysis_ko,
      isAnalyzed: paperData.isAnalyzed ?? false,
      createdAt: toTimestampLike(now),
      createdAtMs: now,
      userId: paperData.userId || DEBUG_USER_ID,
      source: paperData.source,
      analyzedAtMs: undefined,
    };

    const next = [record, ...getDebugPaperRecords()];
    setDebugPaperRecords(next);
    return { id: record.id };
  }

  return await addDoc(collection(db, PAPERS_COLLECTION), {
    ...paperData,
    createdAt: serverTimestamp(),
    isAnalyzed: paperData.isAnalyzed ?? false
  });
};

export const updatePaperAnalysis = async (paperId: string, analysis: any) => {
  const debugPapers = getDebugPaperRecords();
  const debugIndex = debugPapers.findIndex((paper) => paper.id === paperId);
  if (debugIndex >= 0) {
    debugPapers[debugIndex] = {
      ...debugPapers[debugIndex],
      analysis_ko: analysis,
      isAnalyzed: true,
      analyzedAtMs: Date.now(),
    };
    setDebugPaperRecords(debugPapers);
    return;
  }

  const paperRef = doc(db, PAPERS_COLLECTION, paperId);
  await updateDoc(paperRef, {
    analysis_ko: analysis,
    isAnalyzed: true,
    analyzedAt: serverTimestamp(),
  });
};
