import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const RecordIdSchema = v.id("records")

export const ChatSchema = v.object({
  id: v.optional(v.string()),
  createdAt: v.number(),
})

export const MessageSchema = v.object({
  id: v.optional(v.string()),
  content: v.string(), // TODO: this should be an array of strings so we dont have to join them chunks in the server
  streaming: v.optional(v.boolean()),
  chatId: RecordIdSchema,
  index: v.number(),
  streamId: v.optional(v.id("streams")),
  from: v.union(v.literal("user"), v.literal("assistant")),
})

export const StreamSchema = v.object({
  content: v.array(v.string()),
  finished: v.boolean(),
  updatedAt: v.number(),
  userId: v.id("users"),
})

let RecordTypeSchema = v.union(v.literal("chats"), v.literal("messages"))

export const RecordSchema = {
  type: RecordTypeSchema,
  updatedAt: v.number(),
  deleted: v.boolean(),
  data: v.union(ChatSchema, MessageSchema),
  userId: v.id("users"),
}

export type RecordType = Infer<typeof RecordTypeSchema>
export type RecordId = Infer<typeof RecordIdSchema>
export type ChatModel = Infer<typeof ChatSchema>
export type MessageModel = Infer<typeof MessageSchema>
export type RecordData = MessageModel | ChatModel
export type StreamModel = Infer<typeof StreamSchema>

export default defineSchema({
  ...authTables,
  records: defineTable(RecordSchema)
    .index("by_userId", ["userId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"])
    .index("by_chatId", ["data.chatId"]),
  streams: defineTable(StreamSchema)
    .index("by_userId", ["userId"])
  ,
})

