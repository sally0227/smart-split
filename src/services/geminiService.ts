declare const process: any;
import { GoogleGenAI } from "@google/genai";
import { Expense, Group, Member, Transaction } from "../types";

const getAiClient = () => {
  // Use try-catch to safely access process.env in different environments
  let apiKey: string | undefined;
  try {
      apiKey = process.env.API_KEY;
  } catch (e) {
      console.error("Environment variable access error:", e);
  }
  
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Helper to clean AI response before parsing
const cleanAndParseJson = (text: string) => {
  try {
    // Remove markdown code blocks (```json ... ``` or just ``` ... ```)
    let cleanText = text.replace(/^```json\s*/g, "").replace(/^```\s*/g, "").replace(/\s*```$/g, "");
    // Determine if there is any leading/trailing text outside braces
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e, "Text was:", text);
    return {};
  }
};

// Generates both a text summary and an SVG visualization
export const generateHistoryArtifact = async (group: Group, expenses: Expense[]): Promise<{ summary: string, svg: string }> => {
  const ai = getAiClient();
  
  // Fallback data if AI fails or isn't present
  const fallback = { summary: "活動記錄已成功歸檔。", svg: "" };
  
  if (!ai) return fallback;

  const memberNames = group.members.map(m => m.name).join(", ");
  const expenseList = expenses.map(e => 
    `- ${e.date.split('T')[0]}: ${e.title} ($${e.totalAmount})`
  ).slice(0, 20).join("\n"); // Limit to 20 items to avoid token limits

  const prompt = `
    這是 "${group.name}" 群組的消費紀錄。
    成員: ${memberNames}。
    紀錄:
    ${expenseList}
    
    請生成 JSON 格式回應，包含兩個欄位：
    1. "summary": 繁體中文，100字內，幽默總結這次活動的消費風格。
    2. "svg": 一個 SVG 格式的垂直時間軸 (Vertical Timeline)。
       - 寬度 100%, 高度依內容調整 (viewBox="0 0 400 [HEIGHT]")。
       - 背景透明或白色。
       - 使用圓形節點串接直線代表時間軸。
       - 每個節點旁顯示：日期、標題、金額。
       - 風格：現代、扁平化、色彩柔和 (Pastel)。
       - 確保 SVG 語法正確且閉合。
    
    請直接回傳 JSON 字串，不要使用 markdown 標記。
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const json = cleanAndParseJson(text);
    
    return {
      summary: json.summary || fallback.summary,
      svg: json.svg || ""
    };

  } catch (error) {
    console.error("Gemini History Error:", error);
    return fallback;
  }
};

export const explainSettlementLogic = async (
  memberMap: Map<string, string>, // id -> name
  rawBalances: Record<string, number>,
  finalTransactions: Transaction[]
): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "系統自動計算的最佳還款路徑。";

  const balanceDesc = Object.entries(rawBalances).map(([id, amount]) => {
    const name = memberMap.get(id);
    return `${name}: ${amount > 0 ? `收 ${amount}` : `付 ${Math.abs(amount)}`}`;
  }).join("\n");

  const transDesc = finalTransactions.map(t => 
    `${memberMap.get(t.from)}給${memberMap.get(t.to)} ${t.amount}`
  ).join("\n");

  const prompt = `
    原始淨額:
    ${balanceDesc}
    最終方案:
    ${transDesc}
    
    請用繁體中文，一句話解釋"債務抵銷"的邏輯。
    例如："A原本欠B，但C欠A，所以C直接還給B來抵銷。"
    不要列數字。50字內。
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text || "系統已自動簡化債務關係。";
  } catch (error) {
    console.error("Gemini Logic Error:", error);
    return "系統已自動簡化債務關係。";
  }
};

