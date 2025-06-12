import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { DataModel, Id } from "./_generated/dataModel";
import { v, Infer } from "convex/values";
import { ChatModel, ChatSchema, MessageModel, MessageSchema, RecordData, RecordType } from "./schema";
import { OpenAI } from "openai";
import { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const openai = new OpenAI({
  // apiKey: process.env.OPENAI_API_KEY
});


export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    let userId = await getRequiredUserId(ctx);
    let user = await ctx.db.get(userId)!
    console.log("user", user)
    console.log("userId", userId)
    return {
      id: userId,
      name: user?.name || "",
    }
  }
})

export const getStream = query({
  args: {
    id: v.id("streams")
  },
  handler: async (ctx, { id }) => {
    let userId = await getRequiredUserId(ctx);
    let stream = await ctx.db.get(id)
    if (!stream || stream.userId !== userId) throw new Error(`Stream ${id} not found`)
    return stream
  }
})

let ChatSyncSchema = v.object({
  id: v.string(),
  state: v.union(v.literal("updated"), v.literal("deleted")),
  data: ChatSchema,
})

let MessageSyncSchema = v.object({
  id: v.string(),
  state: v.union(v.literal("updated"), v.literal("deleted")),
  data: MessageSchema,
})

export const sync = mutation({
  args: {
    cursor: v.optional(v.number()),
    chats: v.array(ChatSyncSchema),
    messages: v.array(MessageSyncSchema)
  },
  handler: async (ctx, args) => {
    let userId = await getRequiredUserId(ctx)
    let allRecords = [
      ...args.chats.map(x => ({ ...x, type: "chats" as RecordType })),
      ...args.messages.map(x => ({ ...x, type: "messages" as RecordType })),
    ]
    let newMessage: MessageModel | undefined = undefined
    for (let record of allRecords) {
      let isNewRecord = record.id.startsWith("clientid:");
      if (isNewRecord) {
        record.data.id = record.id
        if (record.type === "messages") {
          let message = record.data as MessageModel
          let valid = await validateMessage(userId, message, ctx)
          if (valid) {
            newMessage = message
          } else {
            console.warn(`Unable to sync message ${record.id} for user ${userId}. Message failed validation.`)
            record.state = "deleted"
          }
        }
        await ctx.db.insert("records", {
          type: record.type,
          deleted: false,
          updatedAt: Date.now(),
          data: record.data,
          userId: userId
        })
      } else {
        let recordId = await validateRecordId(record.id, userId, ctx)
        if (!recordId) {
          console.warn(`Unable to sync record ${record.id} for user ${userId}. Record failed validation.`)
          continue
        }
        await ctx.db.patch(recordId, {
          deleted: record.state === "deleted",
          updatedAt: Date.now(),
          data: record.data
        })
      }
    }
    // we intentionally only want to respond to one single message per sync to help prevent DDoS
    if (newMessage) {
      await onNewMessage(userId, ctx, newMessage)
    }
    let cursor = args.cursor ?? 0
    let { updatedRecords, updatedAt } = await getUpdatedRecords(userId, cursor, ctx)
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
          content: newContent.join(""),
          streaming: false,
          streamId: undefined
        }
      })
      let deleteAfter = 2 * 60 * 60 * 1000 // 2 hours
      await ctx.scheduler.runAfter(deleteAfter, internal.functions.deleteStream, {
        streamId
      })
    }
  }
})

export const getMessagesForChat = internalQuery({
  args: {
    chatId: v.id("records")
  },
  handler: async (ctx, { chatId }) => {
    let messages = await ctx.db
      .query("records")
      .withIndex("by_chatId", (q) => q.eq("data.chatId", chatId))
      .collect()
    return messages.map(x => x.data as MessageModel)
  }
})


export const deleteStream = internalMutation({
  args: {
    streamId: v.id("streams")
  },
  handler: async (ctx, { streamId }) => {
    await ctx.db.delete(streamId)
  }
})

export const startStream = internalAction({
  args: {
    streamId: v.id("streams"),
    chatId: v.id("records"),
    responseMessageId: v.id("records")
  },
  handler: async (ctx, { streamId, chatId, responseMessageId }) => {
    let chatHistory = (
      await ctx.runQuery(internal.functions.getMessagesForChat, {
        chatId: chatId
      }))
      .sort((a, b) => a.index - b.index)
      .map(message => ({ role: message.from, content: message.content }))

    try {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4.1-mini', // or 'gpt-3.5-turbo'
        messages: chatHistory,
        stream: true
      });
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          await ctx.runMutation(internal.functions.appendStreamContent, {
            streamId,
            messageId: responseMessageId,
            content: content,
            final: false
          })
        }
      }
      await ctx.runMutation(internal.functions.appendStreamContent, {
        streamId,
        messageId: responseMessageId,
        content: "",
        final: true
      })
    } catch (error) {
      await ctx.runMutation(internal.functions.appendStreamContent, {
        streamId,
        messageId: responseMessageId,
        content: `Failed: ${error}`,
        final: true
      })
    }
  }
})

async function onNewMessage(
  userId: Id<"users">,
  ctx: GenericMutationCtx<DataModel>,
  newMessage: MessageModel,
) {
  let streamId = await ctx.db.insert("streams", {
    content: [],
    finished: false,
    updatedAt: Date.now(),
    userId
  })
  let responseMessage: MessageModel = {
    chatId: newMessage.chatId,
    content: "",
    index: newMessage.index + 0.5,
    streaming: true,
    streamId,
    from: "assistant"
  }
  let responseMessageId = await ctx.db.insert("records", {
    type: "messages",
    deleted: false,
    updatedAt: Date.now(),
    data: responseMessage,
    userId,
  })
  ctx.scheduler.runAfter(0, internal.functions.startStream, {
    streamId,
    chatId: newMessage.chatId,
    responseMessageId
  })
}

async function getRequiredUserId(ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>) {
  let userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("User not authenticated")
  return userId
}


async function validateMessage(
  userId: Id<"users">,
  message: MessageModel,
  ctx: GenericMutationCtx<DataModel>,
) {
  let chat = await ctx.db.get(message.chatId)
  let invalid = !chat || chat.userId !== userId || message.from !== "user"
  return !invalid
}

async function validateRecordId(
  id: string,
  userId: Id<"users">,
  ctx: GenericMutationCtx<DataModel>,
) {
  let recordId = ctx.db.normalizeId("records", id);
  if (!recordId) return false
  let record = await ctx.db.get(recordId)
  if (!record) return false
  if (record.userId !== userId) return false
  return recordId
}

async function getUpdatedRecords(
  userId: Id<"users">,
  cursor: number,
  ctx: GenericMutationCtx<DataModel>,
) {
  let updatedRecordsRaw = await ctx.db
    .query("records")
    .withIndex("by_userId_updatedAt", (q) =>
      q.eq("userId", userId).gt("updatedAt", cursor)
    )
    .collect()
  let updatedRecords = updatedRecordsRaw.map(x => {
    let record = {
      id: x._id,
      state: (x.deleted ? "deleted" : "updated") as "updated" | "deleted",
      type: x.type,
      data: x.data
    }
    return record
  })
  let updatedAt = updatedRecordsRaw[updatedRecordsRaw.length - 1]?.updatedAt ?? 0
  return { updatedRecords, updatedAt }
}