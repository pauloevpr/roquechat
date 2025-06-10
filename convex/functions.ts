import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ChatModel, ChatSchema, MessageModel, MessageSchema, RecordData, RecordType } from "./schema";

export const getStream = query({
  args: {
    id: v.id("streams")
  },
  handler: async (ctx, { id }) => {
    // TODO: check if the user owns the message
    return await ctx.db.get(id)
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
    let newMessage: MessageModel | undefined = undefined
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
          // we intentionally only allow one new message per sync help prevent DDoS
          newMessage = message
        }
      } else {
        let recordId = ctx.db.normalizeId("records", record.id);
        if (!recordId) throw new Error(`Record ${record.id} is not a valid id`)
        let existingRecord = await ctx.db.get(recordId)
        if (!existingRecord) throw new Error(`Record ${record.id} does not exist`)
        await ctx.db.patch(existingRecord._id, {
          deleted: record.state === "deleted",
          updatedAt: Date.now(),
          data: record.data
        })
      }
    }
    if (newMessage) {
      let streamId = await ctx.db.insert("streams", {
        content: [],
        finished: false,
        updatedAt: Date.now()
      })
      let responseMessage: MessageModel = {
        chatId: newMessage.chatId,
        content: "",
        index: newMessage.index + 0.5,
        streaming: true,
        streamId
      }
      let responseMessageId = await ctx.db.insert("records", {
        type: "messages",
        deleted: false,
        updatedAt: Date.now(),
        data: responseMessage
      })
      ctx.scheduler.runAfter(0, internal.functions.handleInputMessageInternal, {
        streamId,
        inputMessage: newMessage,
        responseMessageId
      })
    }
    let cursor = args.cursor ?? 0
    let updatedRecordsRaw = await ctx.db
      .query("records")
      .withIndex("by_updatedAt", (q) => q.gt("updatedAt", cursor))
      .collect()
    let updatedRecords = updatedRecordsRaw.map(x => {
      let data: RecordData = { ...x.data, convexId: x._id }
      let record = {
        id: x._id,
        state: (x.deleted ? "deleted" : "updated") as "updated" | "deleted",
        type: x.type,
        data: data
      }
      return record
    }
    )
    let updatedAt = updatedRecordsRaw[updatedRecordsRaw.length - 1]?.updatedAt ?? 0
    return {
      records: updatedRecords,
      syncCursor: updatedAt,
    }
  }
})

export const appendStreamContent = internalMutation({
  args: {
    streamId: v.id("streams"),
    messageId: v.id("records"),
    content: v.string(),
    final: v.boolean()
  },
  handler: async (ctx, { streamId, messageId, content, final }) => {
    let stream = await ctx.db.get(streamId)
    if (!stream) throw new Error(`Stream ${streamId} not found`)
    let newContent = [...stream.content, content]
    await ctx.db.patch(streamId, {
      content: newContent,
      finished: final,
      updatedAt: Date.now()
    })
    if (final) {
      let message = await ctx.db.get(messageId)
      if (!message) throw new Error(`Message ${messageId} not found`)
      if (message.type !== "messages") throw new Error(`Message ${messageId} is not a message`)
      let messageData = message.data as MessageModel
      await ctx.db.patch(messageId, {
        data: {
          ...messageData,
          content: stream.content.join(""),
          streaming: false,
          streamId: undefined
        }
      })
    }
  }
})

export const handleInputMessageInternal = internalAction({
  args: {
    streamId: v.id("streams"),
    inputMessage: MessageSchema,
    responseMessageId: v.id("records")
  },
  handler: async (ctx, { streamId, inputMessage, responseMessageId }) => {
    let chunksCount = 50
    for (let i = 0; i < chunksCount; i++) {
      let chunk = `Message chunk ${i} `
      await ctx.runMutation(internal.functions.appendStreamContent, {
        streamId,
        messageId: responseMessageId,
        content: chunk,
        final: i === chunksCount - 1
      })
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
})