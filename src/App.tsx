import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { fetchPapers, savePaper, updatePaperAnalysis, Paper } from "./services/paperService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Plus, 
  Search, 
  History, 
  Brain, 
  ExternalLink, 
  Loader2, 
  Menu,
  LogOut,
  ChevronRight,
  BookOpen,
  Sun,
  Moon,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";

function normalizePdfUrl(url: string, source?: string) {
  if (!url) return url;

  const trimmed = url.trim();

  if (source === "arXiv" || trimmed.includes("arxiv.org")) {
    const httpsUrl = trimmed.replace("http://", "https://");
    if (httpsUrl.includes("/abs/")) {
      return httpsUrl.replace("/abs/", "/pdf/").replace(/v\d+$/, (m) => `${m}.pdf`);
    }
    if (httpsUrl.includes("/pdf/") && !httpsUrl.endsWith(".pdf")) {
      return `${httpsUrl}.pdf`;
    }
    return httpsUrl;
  }

  if (source === "bioRxiv" || trimmed.includes("biorxiv.org/content/")) {
    if (trimmed.endsWith(".pdf")) return trimmed.replace("http://", "https://");
    return `${trimmed.replace(/\/$/, "").replace("http://", "https://")}.full.pdf`;
  }

  return trimmed.replace("http://", "https://");
}

function getPaperLandingUrl(pdfUrl: string, source?: string) {
  if (!pdfUrl) return pdfUrl;
  const normalized = normalizePdfUrl(pdfUrl, source);

  if (source === "arXiv" || normalized.includes("arxiv.org")) {
    return normalized.replace("/pdf/", "/abs/").replace(/\.pdf$/i, "");
  }

  if (source === "bioRxiv" || normalized.includes("biorxiv.org/content/")) {
    return normalized.replace(/\.full\.pdf$/i, "").replace(/\.pdf$/i, "");
  }

  return normalized;
}

export default function App() {
  const { user, loading: authLoading, login, loginDebug, logout } = useAuth();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [newPaperUrl, setNewPaperUrl] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [pdfViewState, setPdfViewState] = useState<"loading" | "ready" | "fallback">("loading");
  const [pdfLoadNonce, setPdfLoadNonce] = useState(0);

  const selectedPdfUrl = selectedPaper ? normalizePdfUrl(selectedPaper.pdfUrl, selectedPaper.source) : "";
  const selectedPaperUrl = selectedPaper ? getPaperLandingUrl(selectedPaper.pdfUrl, selectedPaper.source) : "";
  const mightBlockInline = selectedPaper?.source === "bioRxiv";

  useEffect(() => {
    if (user) {
      loadInitialPapers();
    }
  }, [user]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (!selectedPaper || !selectedPdfUrl) return;
    setPdfViewState("loading");

    const fallbackTimer = window.setTimeout(() => {
      setPdfViewState((prev) => (prev === "ready" ? prev : "fallback"));
    }, 9000);

    return () => window.clearTimeout(fallbackTimer);
  }, [selectedPaper?.id, selectedPdfUrl, pdfLoadNonce]);

  const toggleTheme = () => setTheme(prev => prev === "dark" ? "light" : "dark");

  const requestAnalysis = async (text: string) => {
    const analyzeRes = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!analyzeRes.ok) {
      const errorText = await analyzeRes.text();
      throw new Error(errorText || "Failed to analyze text");
    }

    const { analysis } = await analyzeRes.json();
    const isValid =
      analysis &&
      typeof analysis.summary === "string" &&
      typeof analysis.methodology === "string" &&
      typeof analysis.experimental_results === "string" &&
      typeof analysis.implementation_feasibility === "string" &&
      Array.isArray(analysis.key_takeaways);
    if (!isValid) {
      throw new Error("분석 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");
    }

    return analysis;
  };

  const loadInitialPapers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await fetchPapers(user.uid);
      setPapers(result.papers);
      setLastVisible(result.lastVisible || null);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!user || !lastVisible) return;
    setLoading(true);
    try {
      const result = await fetchPapers(user.uid, 10, lastVisible);
      setPapers(prev => [...prev, ...result.papers]);
      setLastVisible(result.lastVisible || null);
    } catch (error) {
      console.error("Load More Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchArxiv = async () => {
    if (!user) return;
    setFetching(true);
    try {
      // Fetch from both sources
      const [arxivRes, biorxivRes] = await Promise.all([
        fetch("/api/fetch-arxiv?maxResults=10"),
        fetch("/api/fetch-biorxiv?maxResults=10")
      ]);
      
      const { papers: arxivPapers } = await arxivRes.json();
      const { papers: biorxivPapers } = await biorxivRes.json();
      
      const allFetched = [...arxivPapers, ...biorxivPapers];
      
      let addedCount = 0;
      for (const p of allFetched) {
        const paperData: Partial<Paper> = {
          title: p.title,
          pdfUrl: normalizePdfUrl(p.pdfUrl, p.source),
          authors: p.authors,
          abstract: p.abstract,
          publishedAt: Timestamp.fromDate(new Date(p.publishedAt)),
          userId: user.uid,
          isAnalyzed: false,
          source: p.source
        };
        const docRef = await savePaper(paperData);
        if (docRef) addedCount++;
      }
      
      if (addedCount > 0) {
        loadInitialPapers();
      }
    } catch (error) {
      console.error("Fetch Papers Error:", error);
    } finally {
      setFetching(false);
    }
  };

  const handleAnalyzePaper = async (paper: Paper) => {
    if (!user || paper.isAnalyzed) return;
    setAnalyzing(true);
    try {
      // 1. Extract Text
      const extractRes = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: paper.pdfUrl })
      });
      if (!extractRes.ok) {
        throw new Error(await extractRes.text());
      }
      const { text } = await extractRes.json();

      // 2. AI Analysis (backend API)
      const analysis = await requestAnalysis(text);
      await updatePaperAnalysis(paper.id, analysis);
      const analyzedAt = Timestamp.now();

      // 3. Update local state
      setPapers(prev =>
        prev.map(p =>
          p.id === paper.id ? { ...p, analysis_ko: analysis, isAnalyzed: true, analyzedAt } : p
        )
      );
      if (selectedPaper?.id === paper.id) {
        setSelectedPaper({ ...paper, analysis_ko: analysis, isAnalyzed: true, analyzedAt });
      }
    } catch (error) {
      console.error("Analysis Error:", error);
      alert("AI 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddPaper = async () => {
    if (!user || !newPaperUrl) return;
    setAnalyzing(true);
    try {
      const normalizedUrl = normalizePdfUrl(newPaperUrl);
      const arxivId = normalizedUrl.split("/").pop()?.replace(".pdf", "") || "unknown";
      const paperData: Partial<Paper> = {
        title: `Research Paper (${arxivId})`,
        pdfUrl: normalizedUrl,
        publishedAt: Timestamp.now(),
        userId: user.uid,
        authors: ["Unknown Author"]
      };

      const docRef = await savePaper(paperData);
      if (!docRef) {
        alert("이미 등록된 논문입니다.");
        setAnalyzing(false);
        return;
      }
      
      const newId = docRef.id;

      // Extract and Analyze
      const extractRes = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl })
      });
      if (!extractRes.ok) {
        throw new Error(await extractRes.text());
      }
      const { text } = await extractRes.json();

      const analysis = await requestAnalysis(text);
      await updatePaperAnalysis(newId, analysis);

      loadInitialPapers();
      setNewPaperUrl("");
    } catch (error) {
      console.error("Add Paper Error:", error);
      alert("논문 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveAnalysis = async (paper: Paper) => {
    if (!paper.analysis_ko) {
      alert("저장할 분석 결과가 없습니다.");
      return;
    }

    setSaving(true);
    try {
      await updatePaperAnalysis(paper.id, paper.analysis_ko);
      const analyzedAt = Timestamp.now();

      setPapers((prev) =>
        prev.map((p) => (p.id === paper.id ? { ...p, isAnalyzed: true, analyzedAt } : p))
      );
      if (selectedPaper?.id === paper.id) {
        setSelectedPaper({ ...paper, isAnalyzed: true, analyzedAt });
      }
      alert("분석 내용을 저장했습니다.");
    } catch (error) {
      console.error("Save Analysis Error:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] dark:bg-[#0a0a0a] bg-white">
        <div className="flex flex-col items-center gap-3 text-gray-600 dark:text-gray-300">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">로그인 상태를 확인 중입니다...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] dark:bg-[#0a0a0a] bg-white text-gray-900 dark:text-white p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-6 max-w-md"
        >
          <div className="flex justify-center">
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
              <Brain className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Synapse Lab</h1>
          <p className="text-gray-500 dark:text-gray-400">
            BCI, HCI, Zero-UI 전문 연구실. <br />
            논문 전문 분석 및 타임라인 아카이브를 시작하세요.
          </p>
          <Button onClick={login} size="lg" className="w-full rounded-xl font-semibold">
            Google 계정으로 로그인
          </Button>
          {import.meta.env.DEV && (
            <Button onClick={loginDebug} variant="outline" size="lg" className="w-full rounded-xl">
              로컬 디버그 계정으로 로그인
            </Button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 overflow-hidden transition-colors duration-300">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0f0f0f] flex flex-col h-full"
          >
            <div className="p-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6 text-primary" />
                <span className="font-bold text-lg">Synapse Lab</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
                <Menu className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-4 mb-4 space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input 
                  placeholder="논문 검색..." 
                  className="pl-9 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-xl focus-visible:ring-primary"
                />
              </div>
              <Button 
                variant="outline" 
                className="w-full rounded-xl border-primary/20 text-primary hover:bg-primary/5"
                onClick={handleFetchArxiv}
                disabled={fetching}
              >
                {fetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                최신 논문 자동 수집
              </Button>
            </div>

            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full px-4">
                <div className="space-y-2 py-4">
                  <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <History className="h-3 w-3" />
                    최근 연구 타임라인
                  </div>
                  {papers.map((paper) => (
                    <button
                      key={paper.id}
                      onClick={() => setSelectedPaper(paper)}
                      className={`w-full text-left p-3 rounded-xl transition-all group border ${
                        selectedPaper?.id === paper.id 
                          ? "bg-primary/10 border-primary/20" 
                          : "hover:bg-gray-200 dark:hover:bg-white/5 border-transparent"
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                          {paper.title}
                        </span>
                        <div className="flex items-center justify-between text-[10px] text-gray-500">
                          <div className="flex items-center gap-2">
                            <span>{paper.publishedAt?.toDate ? format(paper.publishedAt.toDate(), "yyyy.MM.dd") : "Date unknown"}</span>
                            {paper.source && (
                              <span className="opacity-60">[{paper.source}]</span>
                            )}
                          </div>
                          {paper.isAnalyzed ? (
                            <Badge variant="outline" className="text-[8px] h-4 bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/20">Analyzed</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[8px] h-4 bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20">Pending</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                  
                  {lastVisible && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      onClick={loadMore}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : "이전 리포트 더 찾기"}
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a] shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] dark:shadow-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                    {user.displayName?.[0] || "U"}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{user.displayName}</span>
                    <span className="text-[10px] text-gray-500">{user.isDebug ? "Local Debug" : "Researcher"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-gray-500">
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={logout} className="text-gray-500 hover:text-red-400">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-gray-200 dark:border-white/10 flex items-center justify-between px-6 bg-white dark:bg-[#0f0f0f]">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 max-w-md">
                <Input 
                  placeholder="arXiv PDF URL 입력..." 
                  value={newPaperUrl}
                  onChange={(e) => setNewPaperUrl(e.target.value)}
                  className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-xl w-[300px]"
                />
                <Button 
                  onClick={handleAddPaper} 
                  disabled={analyzing || !newPaperUrl}
                  className="rounded-xl"
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  분석 추가
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Gemini 2.5 flash Active</Badge>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {selectedPaper ? (
            <div className="h-full flex flex-col md:flex-row">
              {/* PDF Viewer (Split View) */}
              <div className="flex-1 border-r border-gray-200 dark:border-white/10 bg-gray-200 dark:bg-black relative">
                {mightBlockInline && (
                  <div className="absolute top-4 left-4 z-10 max-w-sm rounded-lg bg-black/70 text-white text-xs px-3 py-2">
                    bioRxiv는 iframe 미리보기를 차단할 수 있습니다. 우측 상단에서 논문 페이지 또는 PDF를 여세요.
                  </div>
                )}
                <iframe 
                  key={`${selectedPaper.id}-${pdfLoadNonce}`}
                  src={`${selectedPdfUrl}#toolbar=0`} 
                  className="w-full h-full"
                  title="PDF Viewer"
                  onLoad={() => setPdfViewState("ready")}
                  onError={() => setPdfViewState("fallback")}
                />
                {pdfViewState !== "ready" && (
                  <div className="absolute inset-0 bg-black/45 flex items-center justify-center p-6">
                    <div className="max-w-md text-center space-y-3 rounded-2xl bg-white/95 dark:bg-[#111] p-5 border border-gray-200 dark:border-white/10">
                      <p className="text-sm font-medium">
                        {pdfViewState === "loading" ? "PDF를 불러오는 중입니다..." : "이 논문은 앱 내 미리보기가 제한될 수 있습니다."}
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setPdfLoadNonce((prev) => prev + 1)}>
                          다시 시도
                        </Button>
                        <a
                          href={selectedPdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 h-8 text-xs font-medium"
                        >
                          <ExternalLink className="h-3 w-3 mr-1.5" />
                          새 탭에서 열기
                        </a>
                      </div>
                    </div>
                  </div>
                )}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <a
                    href={selectedPaperUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-full bg-white dark:bg-secondary text-gray-900 dark:text-secondary-foreground hover:bg-gray-100 dark:hover:bg-secondary/80 h-9 px-3 text-xs font-medium shadow-lg border border-gray-200 dark:border-transparent"
                  >
                    <ExternalLink className="h-3 w-3 mr-2" />
                    논문 페이지
                  </a>
                  <a 
                    href={selectedPdfUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-full bg-white dark:bg-secondary text-gray-900 dark:text-secondary-foreground hover:bg-gray-100 dark:hover:bg-secondary/80 h-9 px-3 text-xs font-medium shadow-lg border border-gray-200 dark:border-transparent"
                  >
                    <ExternalLink className="h-3 w-3 mr-2" />
                    원본 열기
                  </a>
                </div>
              </div>

              {/* Analysis Report */}
              <div className="w-full md:w-[450px] lg:w-[550px] bg-white dark:bg-[#0f0f0f] flex flex-col min-h-0">
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-8 space-y-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-primary">
                          <FileText className="h-5 w-5" />
                          <span className="text-xs font-bold uppercase tracking-widest">Research Report</span>
                        </div>
                        {selectedPaper.analysis_ko && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full"
                            onClick={() => handleSaveAnalysis(selectedPaper)}
                            disabled={saving}
                          >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                            저장
                          </Button>
                        )}
                        {!selectedPaper.isAnalyzed && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="rounded-full border-primary/20 text-primary"
                            onClick={() => handleAnalyzePaper(selectedPaper)}
                            disabled={analyzing}
                          >
                            {analyzing ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Sparkles className="h-3 w-3 mr-2" />}
                            AI 분석 시작
                          </Button>
                        )}
                      </div>
                      <h2 className="text-2xl font-bold leading-tight">{selectedPaper.title}</h2>
                      {selectedPaper.isAnalyzed && selectedPaper.analyzedAt?.toDate && (
                        <p className="text-xs text-gray-500">
                          저장된 분석: {format(selectedPaper.analyzedAt.toDate(), "yyyy.MM.dd HH:mm")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {selectedPaper.authors.map(author => (
                          <Badge key={author} variant="secondary" className="bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 font-normal">
                            {author}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Separator className="bg-gray-200 dark:bg-white/10" />

                    {selectedPaper.isAnalyzed ? (
                      <Tabs defaultValue="analysis" className="w-full">
                        <TabsList className="bg-gray-100 dark:bg-white/5 p-1 rounded-xl w-full">
                          <TabsTrigger value="analysis" className="flex-1 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                            AI 분석 리포트
                          </TabsTrigger>
                          <TabsTrigger value="takeaways" className="flex-1 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                            핵심 인사이트
                          </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="analysis" className="mt-6 space-y-8">
                          <section className="space-y-3">
                            <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                              전체 요약
                            </h3>
                            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-200 dark:border-white/5">
                              <ReactMarkdown>{selectedPaper.analysis_ko?.summary || ""}</ReactMarkdown>
                            </div>
                          </section>

                          <section className="space-y-3">
                            <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                              연구 방법론
                            </h3>
                            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                              <ReactMarkdown>{selectedPaper.analysis_ko?.methodology || ""}</ReactMarkdown>
                            </div>
                          </section>

                          <section className="space-y-3">
                            <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                              실험 결과 및 수치
                            </h3>
                            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-primary/5 p-4 rounded-2xl border border-primary/10">
                              <ReactMarkdown>{selectedPaper.analysis_ko?.experimental_results || ""}</ReactMarkdown>
                            </div>
                          </section>

                          <section className="space-y-3">
                            <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                              구현 가능성 (Full-Diving)
                            </h3>
                            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                              <ReactMarkdown>{selectedPaper.analysis_ko?.implementation_feasibility || ""}</ReactMarkdown>
                            </div>
                          </section>
                        </TabsContent>

                        <TabsContent value="takeaways" className="mt-6">
                          <div className="space-y-4">
                            {selectedPaper.analysis_ko?.key_takeaways?.map((item, i) => (
                              <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                key={i} 
                                className="flex gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5"
                              >
                                <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                  {i + 1}
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{item}</p>
                              </motion.div>
                            ))}
                          </div>
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <div className="space-y-6 py-8">
                        <div className="flex flex-col items-center justify-center text-center space-y-4">
                          {analyzing ? (
                            <>
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              <div className="space-y-1">
                                <p className="font-medium">Gemini 1.5 Pro가 분석 중입니다...</p>
                                <p className="text-xs text-gray-500">전문 텍스트를 읽고 한국어 리포트를 생성하고 있습니다.</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Sparkles className="h-8 w-8" />
                              </div>
                              <div className="space-y-1">
                                <p className="font-medium">분석 대기 중</p>
                                <p className="text-xs text-gray-500">상단의 'AI 분석 시작' 버튼을 눌러 리포트를 생성하세요.</p>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="space-y-4">
                          <Skeleton className="h-4 w-full bg-gray-100 dark:bg-white/5" />
                          <Skeleton className="h-4 w-[90%] bg-gray-100 dark:bg-white/5" />
                          <Skeleton className="h-24 w-full bg-gray-100 dark:bg-white/5" />
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center p-8 bg-gray-50 dark:bg-transparent">
              <div className="max-w-sm space-y-6">
                <div className="flex justify-center">
                  <div className="h-20 w-20 rounded-full bg-white dark:bg-white/5 flex items-center justify-center border border-gray-200 dark:border-white/10 shadow-sm">
                    <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">연구를 시작하세요</h3>
                  <p className="text-sm text-gray-500">
                    왼쪽 타임라인에서 논문을 선택하거나, 상단에 arXiv PDF URL을 입력하여 새로운 분석을 추가하세요.
                    '최신 논문 자동 수집' 버튼으로 연구 주제를 확장할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
