const express = require("express");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const { PDFParse } = require("pdf-parse");
const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenAI, Type } = require("@google/genai");

const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    methodology: { type: Type.STRING },
    experimental_results: { type: Type.STRING },
    implementation_feasibility: { type: Type.STRING },
    key_takeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "summary",
    "methodology",
    "experimental_results",
    "implementation_feasibility",
    "key_takeaways",
  ],
};

let aiClient = null;

function getAiClient() {
  if (aiClient) return aiClient;
  if (!process.env.GEMINI_API_KEY) return null;

  aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return aiClient;
}

async function analyzeText(text) {
  const ai = getAiClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured on the backend.");
  }

  const prompt = `
    당신은 BCI(Brain-Computer Interface), HCI(Human-Computer Interaction), Zero-UI 분야의 시니어 연구원입니다.
    다음 논문의 전문 텍스트를 분석하여 한국어로 상세 리포트를 작성하세요.
    
    분석 항목:
    1. 전체 요약 (Summary): 논문의 핵심 기여도와 목적.
    2. 연구 방법론 (Methodology): 사용된 기술, 알고리즘, 실험 설계.
    3. 구체적 실험 수치 (Experimental Results): 주요 성능 지표, 통계적 유의성, 비교 데이터.
    4. 구현 가능성 (Implementation Feasibility): 현재 기술 수준에서 '풀다이빙' 또는 실제 서비스 구현 가능성 및 기술적 장벽.
    5. 핵심 인사이트 (Key Takeaways): 연구에서 얻을 수 있는 3가지 주요 결론.

    논문 텍스트:
    ${text}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-pro",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: ANALYSIS_RESPONSE_SCHEMA,
    },
  });

  return JSON.parse(response.text);
}

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/")) {
    req.url = req.url.replace("/api", "");
  }
  next();
});

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

  let parser = null;
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    parser = new PDFParse({ data: response.data });
    const data = await parser.getText();
    const text = data.text.substring(0, 50000);
    res.json({ text });
  } catch (error) {
    console.error("PDF Extraction Error:", error);
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

  try {
    const analysis = await analyzeText(text);
    res.json({ analysis });
  } catch (error) {
    console.error("Analyze Error:", error);
    res.status(500).json({ error: "Failed to analyze paper text" });
  }
});

exports.api = onRequest({ region: "us-central1", timeoutSeconds: 120, memory: "1GiB" }, app);
