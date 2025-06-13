import { OpenAI } from "openai";

const openai = new OpenAI({
  // apiKey: process.env.OPENAI_API_KEY
});


export interface ChatEntry {
  content: string
  role: 'user' | 'assistant' | 'system'
  name?: string
}

type ModelConfig = 'gpt-4.1-mini'

export async function createChatCompletion(model: ModelConfig, messages: ChatEntry[]) {
  const response = await openai.chat.completions.create({
    model,
    messages,
  });
  return response.choices[0].message.content ?? undefined
}

export async function streamChatCompletion(model: ModelConfig, messages: ChatEntry[], callback: (content: string | null | undefined) => Promise<void> | void) {
  const response = await openai.chat.completions.create({
    model,
    messages,
    stream: true
  });
  for await (const chunk of response) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      await callback(content)
    }
  }
}