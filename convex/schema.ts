import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";


export const RecordIdSchema = v.id("records")

export const RecordTypeSchema = v.union(
  v.literal("chats"),
  v.literal("messages"),
)

export const ChatSchema = v.object({
  title: v.string(),
  lastMessageAt: v.number(),
})

export const MessageSchema = v.object({
  content: v.string(), // TODO: this should be an array of strings so we dont have to join them chunks in the server
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

export const RecordSchema = v.object({
  type: RecordTypeSchema,
  updatedAt: v.number(),
  deleted: v.boolean(),
  data: v.union(ChatSchema, MessageSchema),
  userId: v.id("users"),
})

export const TrialMessagesSchema = v.object({
  count: v.number(),
  userId: v.id("users"),
})

export default defineSchema({
  ...authTables,
  records: defineTable(RecordSchema)
    .index("by_userId_updatedAt", ["userId", "updatedAt"])
    .index("by_chatId_deleted", ["data.chatId", "deleted"]),
  streams: defineTable(StreamSchema)
    .index("by_userId", ["userId"]),
  trial: defineTable(TrialMessagesSchema)
    .index("by_userId", ["userId"]),
})

export type Chat = Infer<typeof ChatSchema>
export type Message = Infer<typeof MessageSchema>
export type Stream = Infer<typeof StreamSchema>
export type RecordBase = Infer<typeof RecordSchema> & { _id: Id<"records">; _creationTime: number; }
export type RecordWithMessageData = RecordBase & { data: Message }
export type RecordWithChatData = RecordBase & { data: Chat }
export type RecordType = Infer<typeof RecordTypeSchema>