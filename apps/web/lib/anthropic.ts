import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  // Fail early in dev; trong prod build Next sẽ không gọi file này đến khi có request.
  // Không throw khi build, chỉ throw khi sử dụng.
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const CHAT_MODEL = process.env.ANTHROPIC_MODEL_CHAT ?? "claude-sonnet-4-6";
export const FAST_MODEL =
  process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001";
