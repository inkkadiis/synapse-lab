import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const analyzePaper = async (pdfText: string) => {
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
    ${pdfText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-pro", // Using 1.5 Pro as requested for deep analysis
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          methodology: { type: Type.STRING },
          experimental_results: { type: Type.STRING },
          implementation_feasibility: { type: Type.STRING },
          key_takeaways: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["summary", "methodology", "experimental_results", "implementation_feasibility", "key_takeaways"]
      }
    }
  });

  return JSON.parse(response.text);
};
