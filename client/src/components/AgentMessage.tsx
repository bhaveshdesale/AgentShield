import type { AgentChatResponse } from "../types";

interface AgentMessageProps {
  chat: AgentChatResponse;
  isUser?: boolean;
  children?: React.ReactNode;
}

export default function AgentMessage({ chat, isUser, children }: AgentMessageProps) {
  if (isUser) {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[70%] rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-900">
          {chat.message}
        </div>
      </div>
    );
  }

  const isFallback = chat.source === "fallback";

  return (
    <div className="mb-4">
      <div className="flex items-start gap-2">
        <div className="flex h-6 w-6 shrinkage-0 items-center justify-center rounded bg-neutral-900 text-xs text-white">AI</div>
        <div className="max-w-[80%]">
          {isFallback && (
            <span className="mb-1 inline-block text-xs text-neutral-400">
              (fallback agent — LLM unavailable)
            </span>
          )}
          <div className="text-sm text-neutral-900">{chat.message}</div>
          {children}
        </div>
      </div>
    </div>
  );
}
