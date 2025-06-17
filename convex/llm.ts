import { OpenAI } from "openai";
import { GoogleGenAI } from "@google/genai";


export const supportedModels = {
  google: {
    "gemini-2.0-flash": "Google Gemini 2.0 Flash",
  },
  openai: {
    "gpt-4.1-mini": "OpenAI GPT-4.1 Mini",
  }
}

export interface LLM {
  chat(messages: ChatEntry[], options?: { signal?: AbortSignal }): Promise<string | undefined>;
  stream(messages: ChatEntry[], callback: (content: string | undefined) => Promise<void> | void): Promise<void>;
}

export const ai = {
  model(
    model: { id: string, apiKey: string, provider?: string },
    options: { signal: AbortSignal }
  ): LLM {
    if (model.provider === "openrouter") return openrouter(model.id, model.apiKey, options?.signal)
    if (model.id in supportedModels.google) return google(model.id, model.apiKey, options?.signal)
    if (model.id in supportedModels.openai) return openai(model.id, model.apiKey, options?.signal)
    throw new Error(`Model ${model.id} not supported`)
  }
}

function openrouter(model: string, apiKey: string, abort: AbortSignal) {
  return openai(model, apiKey, abort, "https://openrouter.ai/api/v1")
}

function openai(model: string, apiKey: string, abort: AbortSignal, baseUrl?: string) {
  const openai = new OpenAI({ apiKey, baseURL: baseUrl });
  return {
    async chat(messages: ChatEntry[]) {
      const response = await openai.chat.completions.create({
        model,
        messages,
      }, { signal: abort });
      return response.choices[0].message.content ?? undefined
    },
    async stream(messages: ChatEntry[], callback: (content: string | undefined) => Promise<void> | void) {
      const response = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
      }, { signal: abort });
      for await (const chunk of response) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          await callback(content ?? undefined)
        }
      }
    }
  }
}

function google(model: string, apiKey: string, abort: AbortSignal) {
  let google = new GoogleGenAI({ apiKey });
  return {
    async chat(messages: ChatEntry[]) {
      const response = await google.models.generateContent({
        model,
        contents: messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        config: { abortSignal: abort }
      });
      return response.text
    },
    async stream(messages: ChatEntry[], callback: (content: string | undefined) => Promise<void> | void) {
      const response = await google.models.generateContentStream({
        model,
        contents: messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        config: { abortSignal: abort }
      });
      for await (const chunk of response) {
        await callback(chunk.text)
      }
    }
  }
}


export interface ChatEntry {
  content: string
  role: 'user' | 'assistant'
  name?: string
}
