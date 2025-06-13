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

export const sync = mutation({
  args: {
    cursor: v.optional(v.number()),
    chats: v.array(
      v.object({
        id: v.id("records"),
        state: v.union(v.literal("updated"), v.literal("deleted")),
        data: ChatSchema,
      })
    ),
    messages: v.array(
      v.object({
        id: v.id("records"),
        state: v.union(v.literal("updated"), v.literal("deleted")),
        data: MessageSchema,
      })
    )
  },
  handler: async (ctx, args) => {
    // TODO: should we limit the amount of records we proccess at a time?
    let userId = await getRequiredUserId(ctx)
    let allRecords = [
      ...args.chats.map(x => ({ ...x, type: "chats" as RecordType })),
      ...args.messages.map(x => ({ ...x, type: "messages" as RecordType })),
    ]
    for (let record of allRecords) {
      let existingRecord = await ctx.db.get(record.id)
      if (!existingRecord) {
        console.warn(`Unable to sync record ${record.id} for user ${userId}. Record does not exist.`)
        continue
      }
      if (existingRecord.userId !== userId) {
        console.warn(`Unable to sync record ${record.id} for user ${userId}. Record does not belong to user.`)
        continue
      }
      await ctx.db.patch(record.id, {
        deleted: record.state === "deleted",
        updatedAt: Date.now(),
        data: record.data
      })
    }
    let cursor = args.cursor ?? 0
    return await getSyncUpdates(ctx, userId, cursor)
  }
})

export const sendMessage = mutation({
  args: {
    message: v.string(),
    chatId: v.optional(v.id("records"))
  },
  handler: async (ctx, { message, chatId }) => {
    let userId = await getRequiredUserId(ctx)
    let now = Date.now()
    if (chatId) {
      let chat = await ctx.db.get(chatId)
      let invalidChat = !chat || chat.type !== "chats" || chat.userId !== userId
      if (invalidChat) throw new Error(`Chat ${chatId} not found`)
    } else {
      chatId = await ctx.db.insert("records", {
        type: "chats",
        updatedAt: now,
        deleted: false,
        data: {
          createdAt: now,
          updatedAt: now,
        },
        userId
      })
    }
    let newMessage: MessageModel = {
      chatId,
      content: message,
      streaming: false,
      streamId: undefined,
      from: "user",
      createdAt: now,
    }
    await ctx.db.insert("records", {
      type: "messages",
      updatedAt: now,
      deleted: false,
      data: newMessage,
      userId
    })
    let streamId = await ctx.db.insert("streams", {
      content: [],
      finished: false,
      updatedAt: now,
      userId
    })
    let responseMessageId = await ctx.db.insert("records", {
      type: "messages",
      deleted: false,
      updatedAt: now,
      data: {
        chatId: newMessage.chatId,
        content: "",
        streaming: true,
        streamId,
        from: "assistant",
        createdAt: now + 1,
      },
      userId,
    })
    ctx.scheduler.runAfter(0, internal.functions.startStream, {
      streamId,
      chatId,
      responseMessageId
    })
    let syncCursor = now - 1
    let result = await getSyncUpdates(ctx, userId, syncCursor)
    return {
      sync: result,
      chatId,
      message: { ...newMessage, id: responseMessageId }
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
      .sort((a, b) => a.createdAt - b.createdAt)
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
        updatedAt: Date.now(),
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

export const deleteStream = internalMutation({
  args: {
    streamId: v.id("streams")
  },
  handler: async (ctx, { streamId }) => {
    await ctx.db.delete(streamId)
  }
})


async function getRequiredUserId(ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>) {
  let userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("User not authenticated")
  return userId
}


async function getSyncUpdates(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
  cursor: number,
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
  let updatedCursor = updatedRecordsRaw[updatedRecordsRaw.length - 1]?.updatedAt ?? cursor
  return {
    records: updatedRecords,
    syncCursor: updatedCursor.toString(),
  }

}