import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assistantQuery, type AssistantData } from "@/hooks/use-assistant";
import { messageText, topicMessages } from "@/lib/assistant";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export function TaskAssistant({
  initial,
  viewedTopic = "all",
}: {
  initial: AssistantData;
  viewedTopic?: string;
}) {
  const qc = useQueryClient();
  const { data = initial } = useQuery(assistantQuery);
  const input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [errorText, setErrorText] = useState("");
  const [stopped, setStopped] = useState(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant",
        headers: async () => {
          const { data: session } = await supabase.auth.getSession();
          if (!session.session) throw new Error("Sign in to ask about your tasks.");
          return { Authorization: `Bearer ${session.session.access_token}` };
        },
      }),
    [],
  );
  const { messages, sendMessage, status, stop } = useChat({
    id: "instinct-unified",
    messages: initial.messages,
    transport,
    onError: (error) => {
      setErrorText(error.message);
    },
    onFinish: () => {
      void qc.invalidateQueries({ queryKey: ["assistant"] });
    },
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (
      !busy &&
      (document.activeElement === document.body || document.activeElement === input.current)
    )
      input.current?.focus();
  }, [busy]);
  const assignments = { ...data.assignments };
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;
    const part = message.parts.find(
      (p) =>
        isToolUIPart(p) && p.type === "tool-organiseDiscussion" && p.state === "output-available",
    );
    if (part && isToolUIPart(part) && part.state === "output-available") {
      const output = part.output as { topicId?: string };
      if (output.topicId) {
        assignments[message.id] = output.topicId;
        const preceding = messages[i - 1];
        if (preceding?.role === "user") assignments[preceding.id] = output.topicId;
      }
    }
  }
  const visible = topicMessages(messages, viewedTopic, assignments);
  const topic = data.topics.find((t) => t.id === viewedTopic);
  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    setErrorText("");
    setStopped(false);
    setDraft("");
    void sendMessage({ text: text.trim() });
    input.current?.focus();
  };
  return (
    <div className="flex min-h-[600px] h-[calc(100dvh-180px)] flex-col py-4 gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold">Ask Instinct</h1>
          <p className="text-sm text-muted-foreground">Your tasks, in perspective.</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-success">
          <span className="size-1.5 rounded-full bg-success" /> Task-aware
        </span>
      </div>
      <div
        className="flex items-center gap-2 overflow-x-auto shrink-0 pb-1"
        aria-label="Discussion topics"
      >
        <Button asChild variant={viewedTopic === "all" ? "secondary" : "ghost"} size="sm">
          <Link to="/assistant">All discussions</Link>
        </Button>
        {data.topics.map((item) => (
          <Button
            asChild
            key={item.id}
            variant={viewedTopic === item.id ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 max-w-48"
          >
            <Link to="/discussions/$topicId" params={{ topicId: item.id }}>
              <span className="truncate">{item.title}</span>
            </Link>
          </Button>
        ))}
      </div>
      {topic && (
        <div className="flex items-center justify-between border-b border-border pb-3 gap-2">
          <h2 className="text-sm font-semibold truncate">{topic.title}</h2>
          {topic.task_id && (
            <Button asChild size="sm" variant="ghost">
              <Link to="/tasks/$id" params={{ id: topic.task_id }}>
                View task <Icon name="arrow_forward" />
              </Link>
            </Button>
          )}
        </div>
      )}
      <Conversation className="min-h-0" key={viewedTopic}>
        <ConversationContent className="px-0 gap-5">
          {!visible.length && (
            <div className="py-10 flex flex-col items-center gap-5">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon name="psychology" className="text-[32px]" />
              </span>
              <h2 className="text-lg font-semibold">What needs your attention?</h2>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {[
                  "What should I focus on next?",
                  "Which tasks are waiting on me?",
                  "Summarise my progress this week.",
                ].map((question) => (
                  <Button
                    key={question}
                    variant="outline"
                    className="justify-between whitespace-normal text-left h-auto py-3"
                    disabled={busy}
                    onClick={() => submit(question)}
                  >
                    {question}
                    <Icon name="arrow_forward" />
                  </Button>
                ))}
              </div>
            </div>
          )}
          {visible.map((message, index) => {
            const assigned = data.topics.find((t) => t.id === assignments[message.id]);
            const previous = visible[index - 1];
            return (
              <div key={message.id} className="min-w-0">
                {assigned &&
                  viewedTopic === "all" &&
                  assignments[previous?.id ?? ""] !== assigned.id && (
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-px flex-1 bg-border" />
                      <Link
                        to="/discussions/$topicId"
                        params={{ topicId: assigned.id }}
                        className="text-xs text-muted-foreground truncate max-w-[65%]"
                      >
                        {assigned.title}
                      </Link>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                <AssistantMessage
                  message={message}
                  streaming={busy && message.id === messages.at(-1)?.id}
                />
              </div>
            );
          })}
          {busy && !messageText(messages.at(-1) ?? { id: "", role: "assistant", parts: [] }) && (
            <Shimmer>Checking your tasks…</Shimmer>
          )}
          {errorText && (
            <div
              role="alert"
              className="rounded-md bg-destructive-soft p-3 text-sm text-on-destructive-soft break-words"
            >
              {errorText}
            </div>
          )}
          {stopped && !busy && <p className="text-xs text-muted-foreground">Response stopped.</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="shrink-0 bg-background">
        {viewedTopic !== "all" && (
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link to="/assistant">
              <Icon name="forum" /> Return to all discussions
            </Link>
          </Button>
        )}
        <PromptInput onSubmit={({ text }) => submit(text)} className="bg-card rounded-lg">
          <PromptInputTextarea
            ref={input}
            autoFocus
            aria-label="Ask about your Instinct tasks"
            placeholder="Ask about your Instinct tasks…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-20 max-h-40"
            disabled={busy}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              status={status}
              disabled={!busy && !draft.trim()}
              onStop={() => {
                void stop();
                setStopped(true);
              }}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function AssistantMessage({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  return (
    <Message from={message.role} className="max-w-full">
      <MessageContent
        className={
          message.role === "user"
            ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
            : "w-full"
        }
      >
        {message.parts.map((part, index) => {
          if (part.type === "text")
            return (
              <MessageResponse
                key={index}
                isAnimating={streaming}
                className="break-words [&_a]:underline [&_a]:text-current"
              >
                {part.text}
              </MessageResponse>
            );
          if (part.type === "reasoning" && part.text)
            return (
              <Reasoning
                key={index}
                isStreaming={streaming && part.state === "streaming"}
                defaultOpen={false}
              >
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          if (isToolUIPart(part))
            return (
              <Tool key={index} defaultOpen={false}>
                {part.type === "dynamic-tool" ? (
                  <ToolHeader
                    type={part.type}
                    state={part.state}
                    toolName={part.toolName}
                    title="Organise discussion"
                  />
                ) : (
                  <ToolHeader type={part.type} state={part.state} title="Organise discussion" />
                )}
                <ToolContent>
                  <ToolInput input={part.input} />
                  <ToolOutput output={part.output} errorText={part.errorText} />
                </ToolContent>
              </Tool>
            );
          return null;
        })}
      </MessageContent>
      {message.role === "assistant" && messageText(message) && !streaming && (
        <MessageActions>
          <MessageAction
            tooltip="Copy answer"
            onClick={() => {
              void navigator.clipboard
                .writeText(messageText(message))
                .then(() => toast.success("Answer copied"));
            }}
          >
            <Copy />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}
