import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    // Ek poori conversation session ki ID
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    conversationTitle: {
      type: String,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    // Message kisne bheja: user, assistant (AI), ya system
    role: {
      type: String,
      enum: ["user", "assistant", "system", "tool"],
      required: true,
    },
    // Text ya Markdown content
    content: {
      type: String,
      required: true,
    },
    // Agar AI Agent ne koi Tool call kiya (jaise Meta MCP ya DB Query)
    toolCalls: [
      {
        toolName: {
          type: String, // e.g. "fetch_live_meta_ads_mcp" ya "query_database_metrics"
        },
        toolArgs: {
          type: mongoose.Schema.Types.Mixed, // Arguments passed to tool
        },
        toolResult: {
          type: mongoose.Schema.Types.Mixed, // Result returned from tool
        },
        status: {
          type: String,
          enum: ["PENDING", "SUCCESS", "FAILED"],
          default: "SUCCESS",
        },
      },
    ],
    // Kis Ad Account ke context mein baat ho rahi hai
    metaAccountId: {
      type: String,
      default: null,
    },
    claudeSessionId: {
      type: String,
      default: null,
    },
    // Job progress details for Meta Ads and campaign automation execution runs
    jobProgress: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Token Burn & Action Tracking Details
    tokenUsage: {
      inputTokens: {
        type: Number,
        default: 0,
      },
      outputTokens: {
        type: Number,
        default: 0,
      },
      totalTokens: {
        type: Number,
        default: 0,
      },
      cacheCreationInputTokens: {
        type: Number,
        default: 0,
      },
      cacheReadInputTokens: {
        type: Number,
        default: 0,
      },
      model: {
        type: String,
        default: "claude-sonnet-4-5",
      },
      costUsd: {
        type: Number,
        default: 0,
      },
      costInr: {
        type: Number,
        default: 0,
      },
      executionTimeMs: {
        type: Number,
        default: 0,
      },
      actionsPerformed: [
        {
          action: {
            type: String,
          },
          description: {
            type: String,
          },
          tokensBurned: {
            type: Number,
            default: 0,
          },
          status: {
            type: String,
            default: "SUCCESS",
          },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

chatMessageSchema.index({ conversationId: 1, createdAt: 1 });
chatMessageSchema.index({ userId: 1, createdAt: -1 });
chatMessageSchema.index({ userId: 1, "tokenUsage.totalTokens": 1 });

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;
