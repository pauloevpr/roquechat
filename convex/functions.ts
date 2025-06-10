import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ChatModel, ChatSchema, MessageModel, MessageSchema, RecordIdSchema, RecordType } from "./schema";

export const getChat = query({
  args: {
    chatId: v.id("records")
  },
  handler: async (ctx, { chatId }) => {
    // TODO: check if the user owns the chat
    let chat = await ctx.db.get(chatId)
    if (!chat) throw new Error(`Chat ${chatId} not found`)
    if (chat.type !== "chats") throw new Error(`Chat ${chatId} not found`)
    return chat.data as ChatModel
  }
})

export const sync = mutation({
  args: {
    cursor: v.optional(v.number()),
    chats: v.array(
      v.object({
        id: v.string(),
        state: v.union(v.literal("updated"), v.literal("deleted")),
        data: ChatSchema,
      })
    ),
    messages: v.array(
      v.object({
        id: v.string(),
        state: v.union(v.literal("updated"), v.literal("deleted")),
        data: MessageSchema,
      })
    )
  },
  handler: async (ctx, args) => {
    // TODO: make sure we check if the use owns the record before updating it
    // TODO: make sure we check the chat exists and the use owns it
    let allRecords = [
      ...args.chats.map(x => ({ ...x, type: "chats" as RecordType })),
      ...args.messages.map(x => ({ ...x, type: "messages" as RecordType })),
    ]
    let newMessages = new Map<string, MessageModel>()
    for (let record of allRecords) {
      let isNewRecord = record.id.startsWith("clientid:");
      if (isNewRecord) {
        record.data.id = record.id
        await ctx.db.insert("records", {
          type: record.type,
          deleted: false,
          updatedAt: Date.now(),
          data: record.data
        })
        if (record.type === "messages") {
          let message = record.data as MessageModel
          newMessages.set(message.chatId, message)
        }
      } else {
        let existingRecord = await ctx.db
          .query("records")
          .filter((q) => q.eq(q.field("_id"), record.id))
          .first();
        if (!existingRecord) throw new Error(`Record ${record.id} does not exist`)
        await ctx.db.patch(existingRecord._id, {
          deleted: record.state === "deleted",
          updatedAt: Date.now(),
          data: record.data
        })
      }
    }
    if (newMessages.size > 0) {
      for (let messages of newMessages.values()) {
        ctx.scheduler.runAfter(0, internal.functions.handleNewMessageInternal, {
          chatId: messages.chatId,
          message: messages
        })
      }
    }
    let cursor = args.cursor ?? 0
    let updatedRecordsRaw = await ctx.db
      .query("records")
      .withIndex("by_updatedAt", (q) => q.gt("updatedAt", cursor))
      .collect()
    let updatedRecords = updatedRecordsRaw.map(x => ({
      id: x._id,
      state: (x.deleted ? "deleted" : "updated") as "updated" | "deleted",
      type: x.type,
      data: x.data
    }))
    let updatedAt = updatedRecordsRaw[updatedRecordsRaw.length - 1]?.updatedAt ?? 0
    return {
      records: updatedRecords,
      syncCursor: updatedAt,
    }
  }
})

export const updateChatStreamInternal = internalMutation({
  args: {
    chatId: v.id("records"),
    nextChunk: v.string()
  },
  handler: async (ctx, { chatId, nextChunk }) => {
    let chat = await ctx.db.get(chatId)
    if (!chat) throw new Error(`Chat ${chatId} not found`)
    if (chat.type !== "chats") throw new Error(`Chat ${chatId} not found`)
    let data = chat.data as ChatModel
    if (!data.stream) {
      data.stream = { chunks: [] }
    }
    data.stream.chunks.push(nextChunk)
    await ctx.db.patch(chatId, {
      data: data
    })
  }
})

export const createMessageFromStream = internalMutation({
  args: {
    chatId: v.id("records"),
    messageIndex: v.number()
  },
  handler: async (ctx, { chatId, messageIndex }) => {
    let chat = await ctx.db.get(chatId)
    if (!chat) throw new Error(`Chat ${chatId} not found`)
    if (chat.type !== "chats") throw new Error(`Chat ${chatId} not found`)
    let chatData = chat.data as ChatModel
    if (!chatData.stream) throw new Error(`Chat ${chatId} does not contain a stream`)
    await ctx.db.insert("records", {
      type: "messages",
      deleted: false,
      updatedAt: Date.now(),
      data: {
        index: messageIndex,
        content: chatData.stream.chunks.join(""),
        chatId: chatId
      } satisfies MessageModel
    })
    await ctx.db.patch(chatId, {
      updatedAt: Date.now(),
      data: {
        ...chatData,
        stream: undefined
      }
    })
  }
})

export const handleNewMessageInternal = internalAction({
  args: {
    chatId: v.id("records"),
    message: MessageSchema
  },
  handler: async (ctx, { chatId, message }) => {
    let chunksCount = 100
    for (let i = 0; i < chunksCount; i++) {
      let chunk = `Message chunk ${i} `
      await ctx.runMutation(internal.functions.updateChatStreamInternal, {
        chatId,
        nextChunk: chunk
      })
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    await ctx.runMutation(internal.functions.createMessageFromStream, {
      chatId,
      messageIndex: message.index + 1
    })
  }
})