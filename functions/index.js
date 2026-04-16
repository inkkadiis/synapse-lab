const express = require("express");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const { PDFParse } = require("pdf-parse");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { onRequest } = require("firebase-functions/v2/https");

if (!getApps().length) {
  initializeApp();
}

function isValidAnalysisPayload(value) {
  return (
    value &&
    typeof value.summary === "string" &&
    typeof value.methodology === "string" &&
    typeof value.experimental_results === "string" &&
    typeof value.implementation_feasibility === "string" &&
    Array.isArray(value.key_takeaways)
  );
}

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isAllowedPdfUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "arxiv.org" ||
      hostname.endsWith(".arxiv.org") ||
      hostname === "biorxiv.org" ||
      hostname === "www.biorxiv.org"
    );
  } catch {
    return false;
  }
}

async function requireAuthorizedUser(req, res, next) {
  if (process.env.NODE_ENV !== "production" && req.get("X-Debug-Session") === "1") {
    req.user = { uid: "debug-local-user", isDebug: true };
    return next();
  }

  const authHeader = req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.user = await getAuth().verifyIdToken(match[1]);
    return next();
  } catch (error) {
    console.error("[auth] token verification failed", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

async function analyzeText(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the backend.");
  }

  const prompt = `
    당신은 BCI(Brain-Computer Interface), HCI(Human-Computer Interaction), Zero-UI 분야의 시니어 연구원입니다.
    다음 논문의 전문 텍스트를 분석하여 한국어로 상세 리포트를 작성하세요.
    반드시 "JSON 객체 하나만" 반환하세요.
    코드펜스(\`\`\`) 금지, 설명 문장 금지, 마크다운 금지.
    
    분석 항목:
    1. 전체 요약 (Summary): 논문의 핵심 기여도와 목적.
    2. 연구 방법론 (Methodology): 사용된 기술, 알고리즘, 실험 설계.
    3. 구체적 실험 수치 (Experimental Results): 주요 성능 지표, 통계적 유의성, 비교 데이터.
    4. 구현 가능성 (Implementation Feasibility): 현재 기술 수준에서 '풀다이빙' 또는 실제 서비스 구현 가능성 및 기술적 장벽.
    5. 핵심 인사이트 (Key Takeaways): 연구에서 얻을 수 있는 3가지 주요 결론.

    반환 형식(키 이름 고정):
    {
      "summary": string,
      "methodology": string,
      "experimental_results": string,
      "implementation_feasibility": string,
      "key_takeaways": string[]
    }

    논문 텍스트:
    ${text}
  `;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          required: [
            "summary",
            "methodology",
            "experimental_results",
            "implementation_feasibility",
            "key_takeaways",
          ],
          properties: {
            summary: { type: "string" },
            methodology: { type: "string" },
            experimental_results: { type: "string" },
            implementation_feasibility: { type: "string" },
            key_takeaways: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 120000,
    }
  );

  const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("No analysis text returned from Gemini.");
  }
  console.log(`[analyzeText] raw response preview=${rawText.slice(0, 600)}`);

  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    console.error(`[analyzeText] JSON parse failed. cleaned preview=${cleaned.slice(0, 600)}`);
    throw parseError;
  }
  if (!isValidAnalysisPayload(parsed)) {
    console.error("[analyzeText] schema mismatch parsed object:", parsed);
    throw new Error("Analysis response did not match required schema.");
  }
  return parsed;
}

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/")) {
    req.url = req.url.replace("/api", "");
  }
  next();
});
app.use(requireAuthorizedUser);

app.get("/fetch-arxiv", async (req, res) => {
  const { query = "BCI OR HCI OR \"Zero-UI\" OR \"Neural Decoding\"", maxResults = 10 } = req.query;

  try {
    const arxivUrl = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
      query
    )}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
    const response = await axios.get(arxivUrl);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const jsonObj = parser.parse(response.data);
    const entries = jsonObj.feed.entry;

    if (!entries) return res.json({ papers: [] });

    const papers = (Array.isArray(entries) ? entries : [entries]).map((entry) => ({
      id: entry.id.split("/abs/").pop(),
      title: entry.title.replace(/\n/g, " ").trim(),
      authors: Array.isArray(entry.author) ? entry.author.map((a) => a.name) : [entry.author.name],
      abstract: entry.summary.replace(/\n/g, " ").trim(),
      pdfUrl: entry.link.find((l) => l["@_title"] === "pdf" || l["@_type"] === "application/pdf")[
        "@_href"
      ],
      publishedAt: entry.published,
      source: "arXiv",
    }));

    res.json({ papers });
  } catch (error) {
    console.error("arXiv Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch from arXiv" });
  }
});

app.get("/fetch-biorxiv", async (req, res) => {
  const { maxResults = 10 } = req.query;

  try {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const startDate = thirtyDaysAgo.toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];
    const biorxivUrl = `https://api.biorxiv.org/details/biorxiv/${startDate}/${endDate}/0/json`;
    const response = await axios.get(biorxivUrl);

    if (!response.data.collection || !Array.isArray(response.data.collection)) {
      return res.json({ papers: [] });
    }

    const keywords = ["BCI", "Brain-Computer Interface", "Neural Decoding", "HCI", "Neuro"];
    const filtered = response.data.collection
      .filter((item) => {
        const content = (item.title + " " + item.abstract).toLowerCase();
        return keywords.some((kw) => content.includes(kw.toLowerCase()));
      })
      .slice(0, Number(maxResults));

    const papers = filtered.map((item) => ({
      id: item.doi,
      title: item.title,
      authors: item.authors.split("; ").map((a) => a.trim()),
      abstract: item.abstract,
      pdfUrl: `https://www.biorxiv.org/content/${item.doi}.full.pdf`,
      publishedAt: item.date,
      source: "bioRxiv",
    }));

    res.json({ papers });
  } catch (error) {
    console.error("bioRxiv Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch from bioRxiv" });
  }
});

app.post("/extract-pdf", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });
  if (!isAllowedPdfUrl(url)) {
    return res.status(400).json({ error: "Only trusted arXiv and bioRxiv PDF URLs are allowed" });
  }
  const reqId = createRequestId();
  const startedAt = Date.now();
  console.log(`[extract-pdf][${reqId}] start url=${url}`);

  let parser = null;
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    parser = new PDFParse({ data: response.data });
    const data = await parser.getText();
    const text = data.text;
    console.log(
      `[extract-pdf][${reqId}] success chars=${text.length} elapsed_ms=${Date.now() - startedAt}`
    );
    res.json({ text });
  } catch (error) {
    console.error(`[extract-pdf][${reqId}] error elapsed_ms=${Date.now() - startedAt}`, error);
    res.status(500).json({ error: "Failed to extract PDF text" });
  } finally {
    if (parser) {
      await parser.destroy?.();
    }
  }
});

app.post("/analyze", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required" });
  }
  const reqId = createRequestId();
  const startedAt = Date.now();
  console.log(`[analyze][${reqId}] start chars=${text.length}`);

  try {
    const analysis = await analyzeText(text);
    console.log(`[analyze][${reqId}] success elapsed_ms=${Date.now() - startedAt}`);
    res.json({ analysis });
  } catch (error) {
    console.error(`[analyze][${reqId}] error elapsed_ms=${Date.now() - startedAt}`, error);
    const detail = error?.response?.data || error?.message || "Unknown error";
    res.status(500).json({ error: "Failed to analyze paper text", detail });
  }
});

exports.api = onRequest({ region: "us-central1", timeoutSeconds: 120, memory: "1GiB" }, app);
