import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

export const RecordIdSchema = v.id("records")

export const ChatSchema = v.object({
  id: v.optional(v.string()),
  stream: v.optional(v.object({
    chunks: v.array(v.string()),
  })),
  createdAt: v.number(),
})

export const MessageSchema = v.object({
  id: v.optional(v.string()),
  content: v.string(),
  chatId: RecordIdSchema,
  index: v.number(),
})

let RecordTypeSchema = v.union(v.literal("chats"), v.literal("messages"))

export const RecordSchema = {
  type: RecordTypeSchema,
  updatedAt: v.number(),
  deleted: v.boolean(),
  data: v.union(ChatSchema, MessageSchema)
}


export type RecordType = Infer<typeof RecordTypeSchema>
export type RecordId = Infer<typeof RecordIdSchema>
export type ChatModel = Infer<typeof ChatSchema>
export type MessageModel = Infer<typeof MessageSchema>

export default defineSchema({
  records: defineTable(RecordSchema)
    .index("by_updatedAt", ["updatedAt"]),
})

