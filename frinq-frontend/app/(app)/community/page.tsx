"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api";
import { CommunityRealtimeClient, type ConnectionState } from "@/app/lib/realtime";
import CommunityHeader from "@/app/components/chat/CommunityHeader";
import MessageList from "@/app/components/chat/MessageList";
import MessageComposer from "@/app/components/chat/MessageComposer";
import type { DisplayMessage } from "@/app/components/chat/MessageBubble";
import { MAX_MESSAGES_IN_MEMORY } from "@/app/components/chat/MessageList";
import { track } from "@/app/lib/analytics";

type ViewState = "loading" | "ready" | "no-membership" | "offline";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100dvh-6rem)] flex flex-col items-center justify-center gap-4 px-8 text-center">
      {children}
    </div>
  );
}

interface HistoryMessage {
  id: number;
  client_message_id: string;
  body: string;
  created_at: string;
  author: { id: string; display_name: string | null };
}

function fromHistory(m: HistoryMessage): DisplayMessage {
  return {
    id: m.id,
    clientMessageId: m.client_message_id,
    body: m.body,
    authorId: m.author.id,
    authorDisplayName: m.author.display_name,
    createdAt: m.created_at,
    status: "sent",
  };
}

export default function CommunityPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/api/v1/users/me");
      if (!res.ok) {
        setState("offline");
        return;
      }
      const user = await res.json();
      if (user.community_slug) {
        setCommunitySlug(user.community_slug);
        setUserId(user.id);
        setNeedsDisplayName(!user.display_name);
        setState("ready");
        track("community_opened");
      } else {
        setState("no-membership");
      }
    } catch {
      setState("offline");
    }
  }, []);

  useEffect(() => {
    // Deferred a tick — matches the pattern in vibe-box/page.tsx — so
    // load()'s setState calls aren't treated as synchronous effect-body
    // updates.
    queueMicrotask(() => { load(); });
  }, [load]);

  if (state === "loading") {
    return (
      <Centered>
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[15px]">
          finding your community…
        </p>
      </Centered>
    );
  }

  if (state === "offline") {
    return (
      <Centered>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[16px]">
          couldn&apos;t load your community.
        </p>
        <button
          onClick={load}
          className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.14em] text-[#7C1C0B] underline underline-offset-2"
        >
          retry
        </button>
      </Centered>
    );
  }

  if (state === "no-membership") {
    return (
      <Centered>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[16px]">
          no community assigned yet.
        </p>
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px]">
          check back soon — we&apos;ll place you once your profile is ready.
        </p>
      </Centered>
    );
  }

  return <ChatView communitySlug={communitySlug!} userId={userId} needsDisplayName={needsDisplayName} />;
}

function ChatView({
  communitySlug, userId, needsDisplayName,
}: {
  communitySlug: string;
  userId: string | null;
  needsDisplayName: boolean;
}) {
  const [dismissedNudge, setDismissedNudge] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const clientRef = useRef<CommunityRealtimeClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/v1/community/messages");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages.map(fromHistory));
        setNextCursor(data.next_cursor ?? null);
      } catch {
        // History load failure isn't fatal — realtime can still connect;
        // the user just starts with an empty scrollback for this session.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const client = new CommunityRealtimeClient();
    clientRef.current = client;

    const unsubState = client.onStateChange(setConnectionState);
    const unsubMessage = client.onMessage((m) => {
      setMessages((prev) => {
        const idx = prev.findIndex((x) => x.clientMessageId === m.clientMessageId);
        const resolved: DisplayMessage = {
          id: m.id,
          clientMessageId: m.clientMessageId,
          body: m.body,
          authorId: m.author.id,
          authorDisplayName: m.author.displayName,
          createdAt: m.createdAt,
          status: "sent",
        };
        const next = idx >= 0
          ? prev.map((x, i) => (i === idx ? resolved : x))
          : [...prev, resolved];
        // Cap in-memory list — drop oldest, "load older" re-fetches from
        // the server if the user scrolls back further than this.
        // ponytail: if 300+ messages from others arrive while a local
        // optimistic send is still unconfirmed, the cap could evict its
        // bubble before the matching message.created/rejected frame
        // arrives. Upgrade path if this ever bites: exempt "sending"
        // messages from the cap, or track them in a separate small map.
        return next.length > MAX_MESSAGES_IN_MEMORY ? next.slice(next.length - MAX_MESSAGES_IN_MEMORY) : next;
      });
    });
    const unsubRejected = client.onRejected((r) => {
      setMessages((prev) => prev.map((x) =>
        x.clientMessageId === r.clientMessageId ? { ...x, status: "failed", failureCode: r.code } : x
      ));
    });

    client.start();
    return () => {
      unsubState();
      unsubMessage();
      unsubRejected();
      client.stop();
    };
  }, []);

  function handleSend(body: string) {
    const client = clientRef.current;
    if (!client) return;
    const clientMessageId = client.sendMessage(body);
    track("message_sent");
    setMessages((prev) => [...prev, {
      id: null,
      clientMessageId,
      body,
      authorId: userId,
      authorDisplayName: null,
      createdAt: new Date().toISOString(),
      status: "sending",
    }]);
  }

  function handleRetry(clientMessageId: string) {
    setMessages((prev) => prev.map((x) => (x.clientMessageId === clientMessageId ? { ...x, status: "sending" } : x)));
    clientRef.current?.retryMessage(clientMessageId);
  }

  function handleBlocked(authorId: string) {
    // Remove immediately — don't wait for a history refetch. The server
    // already excludes this author's messages from future history reads
    // (Phase 5's block-aware pagination); this just makes it instant.
    setMessages((prev) => prev.filter((x) => x.authorId !== authorId));
  }

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await apiFetch(`/api/v1/community/messages?before=${encodeURIComponent(nextCursor)}`);
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...data.messages.map(fromHistory), ...prev]);
        setNextCursor(data.next_cursor ?? null);
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  const terminal = connectionState === "suspended" || connectionState === "banned" || connectionState === "auth_expired";

  return (
    <div className="h-[calc(100dvh-6rem)] flex flex-col">
      <CommunityHeader communitySlug={communitySlug} connectionState={connectionState} />
      {needsDisplayName && !dismissedNudge && !terminal && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[rgba(124,28,11,0.06)] border-b border-[rgba(124,28,11,0.12)]">
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px]">
            add a name so people can recognize you.
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <a href="/profile/edit/" style={{ minHeight: 44 }} className="flex items-center font-[family-name:var(--font-motive)] text-[10px] tracking-[0.1em] uppercase text-[#7C1C0B] underline underline-offset-2">
              add name
            </a>
            <button
              onClick={() => setDismissedNudge(true)}
              aria-label="dismiss"
              style={{ minWidth: 44, minHeight: 44 }}
              className="text-[#8B7355]"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {terminal ? (
        <Centered>
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px]">
            {connectionState === "auth_expired" && "your session expired — sign in again to keep chatting."}
            {connectionState === "suspended" && "your account is temporarily suspended from chat."}
            {connectionState === "banned" && "your account has been removed from community chat."}
          </p>
          <a href="/support" className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.1em] text-[#7C1C0B] underline underline-offset-2">
            contact support
          </a>
        </Centered>
      ) : (
        <>
          <MessageList
            messages={messages}
            currentUserId={userId}
            hasMore={!!nextCursor}
            loadingOlder={loadingOlder}
            onLoadOlder={loadOlder}
            onRetry={handleRetry}
            onBlocked={handleBlocked}
          />
          <MessageComposer
            onSend={handleSend}
            disabled={connectionState !== "connected"}
            disabledReason={connectionState === "offline" ? "you're offline" : "reconnecting…"}
          />
        </>
      )}
    </div>
  );
}
