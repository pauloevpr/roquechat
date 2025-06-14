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
  chat(messages: ChatEntry[]): Promise<string | undefined>;
  stream(messages: ChatEntry[], callback: (content: string | undefined) => Promise<void> | void): Promise<void>;
}

export const ai = {
  // openai(model: string, apiKey: string): LLM { return openai(model, apiKey) },
  // google(model: string, apiKey: string): LLM { return goggle(model, apiKey) },
  model(name: string, apiKey: string): LLM {
    if (name in supportedModels.google) return goggle(name, apiKey)
    if (name in supportedModels.openai) return openai(name, apiKey)
    throw new Error(`Model ${name} not supported`)
  }
}

function openai(model: string, apiKey: string) {
  if (!(model in supportedModels.openai)) throw new Error(`OpenAI model ${model} not supported`)
  const openai = new OpenAI({ apiKey });
  return {
    async chat(messages: ChatEntry[]) {
      const response = await openai.chat.completions.create({
        model,
        messages,
      });
      return response.choices[0].message.content ?? undefined
    },

    async stream(messages: ChatEntry[], callback: (content: string | undefined) => Promise<void> | void) {
      const response = await openai.chat.completions.create({
        model,
        messages,
        stream: true
      });
      for await (const chunk of response) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          await callback(content ?? undefined)
        }
      }
    }
  }
}

function goggle(model: string, apiKey: string) {
  if (!(model in supportedModels.google)) throw new Error(`Google model ${model} not supported`)
  let google = new GoogleGenAI({ apiKey });
  return {
    async chat(messages: ChatEntry[]) {
      const response = await google.models.generateContent({
        model,
        contents: messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
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
