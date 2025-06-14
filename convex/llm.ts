import { OpenAI } from "openai";
import { GoogleGenAI } from "@google/genai";

const openai = new OpenAI({
  // apiKey: process.env.OPENAI_API_KEY
});
const google = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


export interface ChatEntry {
  content: string
  role: 'user' | 'assistant'
  name?: string
}

export interface LLM {
  chat(messages: ChatEntry[]): Promise<string | undefined>;
  stream(messages: ChatEntry[], callback: (content: string | undefined) => Promise<void> | void): Promise<void>;
}

export const ai = {
  openai(model: string): LLM { return createOpenAI(model) },
  google(model: string): LLM { return createGoogle(model) }
}

function createOpenAI(model: string) {
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

function createGoogle(model: string) {
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
