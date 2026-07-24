"use client";

import MessageActions from "./MessageActions";

/** Text-only. React already escapes all text content — no dangerouslySetInnerHTML,
 * no Markdown, no link-ification, no images/audio/GIFs/reactions/threads. */

export type MessageStatus = "sending" | "sent" | "failed";

export interface DisplayMessage {
  clientMessageId: string;
  id: number | null;
  body: string;
  authorId: string | null;
  authorDisplayName: string | null;
  createdAt: string;
  status: MessageStatus;
  failureCode?: string;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function MessageBubble({
  message, isOwn, onRetry, onBlocked,
}: {
  message: DisplayMessage;
  isOwn: boolean;
  onRetry?: (clientMessageId: string) => void;
  onBlocked?: (authorId: string) => void;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 max-w-[80%] ${isOwn ? "self-end items-end" : "self-start items-start"}`}
      role="listitem"
    >
      {!isOwn && (
        <div className="flex items-center gap-1 px-1">
          <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.08em] text-[#8B7355]">
            {message.authorDisplayName || "someone"}
          </span>
          {message.authorId && message.id != null && onBlocked && (
            <MessageActions
              messageId={message.id}
              authorId={message.authorId}
              authorDisplayName={message.authorDisplayName}
              onBlocked={onBlocked}
            />
          )}
        </div>
      )}
      <div
        className="px-3.5 py-2.5 rounded-2xl"
        style={{
          background: isOwn ? "#2A1810" : "rgba(42,24,16,0.06)",
          color: isOwn ? "#F5F0E8" : "#2A1810",
          opacity: message.status === "sending" ? 0.6 : 1,
        }}
      >
        <p className="font-[family-name:var(--font-things)] text-[15px] leading-snug whitespace-pre-wrap break-words">
          {message.body}
        </p>
      </div>
      <div className="flex items-center gap-2 px-1">
        <span className="font-[family-name:var(--font-motive)] text-[9px] text-[rgba(42,24,16,0.4)]">
          {message.status === "sending" ? "sending…" : fmtTime(message.createdAt)}
        </span>
        {message.status === "failed" && (
          <button
            onClick={() => onRetry?.(message.clientMessageId)}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.08em] text-[#7C1C0B] underline underline-offset-2 flex items-center"
            style={{ minHeight: 44 }}
          >
            couldn&apos;t send · retry
          </button>
        )}
      </div>
    </div>
  );
}
