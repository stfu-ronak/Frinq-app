"use client";

import { useEffect, useRef } from "react";
import MessageBubble, { type DisplayMessage } from "./MessageBubble";

export const MAX_MESSAGES_IN_MEMORY = 300;

export default function MessageList({
  messages, currentUserId, hasMore, loadingOlder, onLoadOlder, onRetry, onBlocked,
}: {
  messages: DisplayMessage[];
  currentUserId: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onBlocked: (authorId: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLastId = useRef<string | null>(null);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastKey = last ? last.clientMessageId : null;
    if (lastKey && lastKey !== prevLastId.current) {
      bottomRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
    prevLastId.current = lastKey;
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" role="list" aria-label="messages">
      {hasMore && (
        <button
          onClick={onLoadOlder}
          disabled={loadingOlder}
          style={{ minHeight: 44 }}
          className="self-center font-[family-name:var(--font-motive)] text-[10px] tracking-[0.1em] uppercase text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40 px-4"
        >
          {loadingOlder ? "loading…" : "load older"}
        </button>
      )}
      {messages.length === 0 && !hasMore && (
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px] text-center mt-8">
          no messages yet — say hello.
        </p>
      )}
      {messages.map((m) => (
        <MessageBubble
          key={m.clientMessageId}
          message={m}
          isOwn={currentUserId != null && m.authorId === currentUserId}
          onRetry={onRetry}
          onBlocked={onBlocked}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
