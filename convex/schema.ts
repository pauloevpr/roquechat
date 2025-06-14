import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { Id, DataModel } from "./_generated/dataModel";


export const RecordIdSchema = v.id("records")

export const RecordTypeSchema = v.union(
  v.literal("chats"),
  v.literal("messages"),
  v.literal("modelConfigs")
)

export const ChatSchema = v.object({
  title: v.string(),
})

export const MessageSchema = v.object({
  content: v.string(), // TODO: this should be an array of strings so we dont have to join them chunks in the server
  streaming: v.optional(v.boolean()),
  chatId: RecordIdSchema,
  streamId: v.optional(v.id("streams")),
  from: v.union(v.literal("user"), v.literal("assistant")),
})

export const StreamSchema = v.object({
  content: v.array(v.string()),
  finished: v.boolean(),
  updatedAt: v.number(),
  userId: v.id("users"),
})

export const ModelConfigSchema = v.object({
  model: v.string(),
  apiKey: v.string(),
})

export const RecordSchema = v.object({
  type: RecordTypeSchema,
  updatedAt: v.number(),
  deleted: v.boolean(),
  data: v.union(ChatSchema, MessageSchema, ModelConfigSchema),
  userId: v.id("users"),
})

export default defineSchema({
  ...authTables,
  records: defineTable(RecordSchema)
    .index("by_userId", ["userId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"])
    .index("by_chatId", ["data.chatId"]),
  streams: defineTable(StreamSchema)
    .index("by_userId", ["userId"]),
})

export type Chat = Infer<typeof ChatSchema>
export type Message = Infer<typeof MessageSchema>
export type Stream = Infer<typeof StreamSchema>
export type Record = Infer<typeof RecordSchema> & { _id: Id<"records">; _creationTime: number; }
export type RecordWithMessageData = Record & { data: Message }
export type RecordWithChatData = Record & { data: Chat }
export type RecordType = Infer<typeof RecordTypeSchema>
export type ModelConfig = Infer<typeof ModelConfigSchema>