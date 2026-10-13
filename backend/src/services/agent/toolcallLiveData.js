//Yeh user ka message leta hai, System Prompt set karta hai, LLM call karta hai. Agar LLM koi tool call karta hai, toh use execute karke final readable response generate karta hai.
import { AGENT_TOOLS_DEFINITIONS, executeAgentTool } from "./queryDbMetrics.js";
import ChatMessage from "../../models/chatMessage.js";
//  Aap @anthropic-ai/sdk, openai, ya @google/genai use kar sakte hain

export class AgentRouter {
  static getSystemPrompt(accountId) {
    return `You are Newton Ads AI Assistant, an expert Meta Ads growth specialist.
Active Ad Account: ${accountId}

Guidelines:
1. If the user asks about historical trends, past weeks/months performance, use 'query_database_metrics'.
2. If the user asks about "live", "current", "right now", "today's performance", use 'fetch_live_meta_ads_mcp'.
3. Always provide clear, professional, metric-driven answers with ROAS, Spend, and actionable recommendations.`;
  }

  static async processUserMessage({ conversationId, userMessage, accountId, userId }) {
    // 1. User message ko DB mein save karo
    await ChatMessage.create({
      conversationId,
      userId,
      role: "user",
      content: userMessage,
      metaAccountId: accountId,
    });

    // 2. Previous chat history fetch karo (Context ke liye)
    const history = await ChatMessage.find({ conversationId })
      .sort({ createdAt: 1 })
      .limit(10);

    // 3. LLM Call Logic (Decision Engine)
    // (Aapke LLM provider ke hisaab se call karein - e.g. OpenAI / Anthropic / Gemini)
    // LLM decide karega ki Tool call karna hai ya direct answer dena hai.

    return {
      systemPrompt: this.getSystemPrompt(accountId),
      tools: AGENT_TOOLS_DEFINITIONS,
      history,
    };
  }
}
