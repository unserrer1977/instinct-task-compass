import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string; onGatewayResponse?: (response: Response) => Promise<void> },
  messages: ModelMessage[],
  instructions?: string,
  options?: Pick<Parameters<typeof streamText>[0], "tools" | "stopWhen" | "onError">,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  let resolveHeaders: () => void = () => {};
  const gatewayReady = new Promise<void>((resolve) => { resolveHeaders = resolve; });
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      try {
        const response = await runIdFetch.fetch(input, init);
        await config.onGatewayResponse?.(response);
        return response;
      } finally { resolveHeaders(); }
    },
  });
  const reasoning = config.model !== "openai/chat-latest";
  const result = streamText({
    model: provider.responses(config.model),
    // AI SDK 6 lacks `instructions`: rename this key to `system` there.
    ...(instructions ? { instructions } : {}),
    messages,
    maxRetries: 0,
    ...options,
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort: "medium",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  return {
    result,
    runIdFetch,
    gatewayReady,
    response: () =>
      withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({ sendReasoning: true }), runIdFetch),
  };
}
