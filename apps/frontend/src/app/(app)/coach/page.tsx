"use client"

import { Markdown } from "@/components/markdown"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { api, streamPost } from "@/lib/api"
import { cn } from "@/lib/utils"
import * as Dialog from "@radix-ui/react-dialog"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, MessageSquarePlus, MessagesSquare, RefreshCw, Send, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export default function CoachPage() {
  const qc = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [streamingMessage, setStreamingMessage] = useState("")
  const streamingRef = useRef("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [failedMessage, setFailedMessage] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false) // phone: Chats bottom sheet
  const [listOpen, setListOpen] = useState(true) // ≥ md: collapsible sessions tile

  const { data: sessionsData } = useQuery<{ sessions: ChatSession[] }>({
    queryKey: ["chat-sessions"],
    queryFn: () => api.get("/ai/chat/sessions"),
  })

  const sessions = sessionsData?.sessions ?? []

  const createSessionMutation = useMutation({
    mutationFn: () => api.post<ChatSession>("/ai/chat/sessions"),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      setActiveSessionId(session.id)
      setSheetOpen(false)
    },
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when sessions load, not on every mutation state change
  useEffect(() => {
    if (sessionsData && sessions.length === 0 && !createSessionMutation.isPending) {
      createSessionMutation.mutate()
    } else if (sessionsData && sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessionsData])

  const { data: historyData } = useQuery<{ messages: Message[] }>({
    queryKey: ["chat-history", activeSessionId],
    queryFn: () => api.get(`/ai/chat/history?sessionId=${activeSessionId}`),
    enabled: !!activeSessionId,
  })

  const messages = historyData?.messages ?? []

  // biome-ignore lint/correctness/useExhaustiveDependencies: bottomRef.current is a DOM ref
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingMessage])

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ai/chat/sessions/${id}`),
    onSuccess: async (_, deletedId) => {
      await qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      if (activeSessionId === deletedId) {
        const remaining = sessions.filter((s) => s.id !== deletedId)
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id)
        } else {
          createSessionMutation.mutate()
        }
      }
    },
  })

  const clearHistoryMutation = useMutation({
    mutationFn: () => api.delete(`/ai/chat/sessions/${activeSessionId}/history`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-history", activeSessionId] })
      qc.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
  })

  const handleNewChat = () => {
    createSessionMutation.mutate()
  }

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id)
    setSheetOpen(false)
  }

  const handleSend = async (override?: string) => {
    const message = override ?? input.trim()
    if (!message || isStreaming || !activeSessionId) return
    if (!override) setInput("")
    setStreamingMessage("")
    streamingRef.current = ""
    setFailedMessage(null)
    setIsStreaming(true)

    if (!override) {
      qc.setQueryData(
        ["chat-history", activeSessionId],
        (old: { messages: Message[] } | undefined) => ({
          messages: [
            ...(old?.messages ?? []),
            {
              id: `pending-${Date.now()}`,
              role: "user" as const,
              content: message,
              createdAt: new Date().toISOString(),
            },
          ],
        })
      )
    }

    try {
      await streamPost("/ai/chat", { message, sessionId: activeSessionId }, (text) => {
        streamingRef.current += text
        setStreamingMessage((prev) => prev + text)
      })
      // Optimistically add the assistant reply to the cache so the message is
      // visible immediately — the server persists it fire-and-forget, so a plain
      // invalidate would refetch before the DB write completes.
      qc.setQueryData(
        ["chat-history", activeSessionId],
        (old: { messages: Message[] } | undefined) => ({
          messages: [
            ...(old?.messages ?? []),
            {
              id: `optimistic-${Date.now()}`,
              role: "assistant" as const,
              content: streamingRef.current,
              createdAt: new Date().toISOString(),
            },
          ],
        })
      )
      setStreamingMessage("")
      // Background refetch to swap the optimistic entry for the persisted one
      qc.invalidateQueries({ queryKey: ["chat-history", activeSessionId] })
      qc.invalidateQueries({ queryKey: ["chat-sessions"] })
    } catch {
      setFailedMessage(message)
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const sessionList = (
    <>
      <Button
        size="sm"
        onClick={handleNewChat}
        disabled={createSessionMutation.isPending}
        className="gap-2 w-full justify-start shrink-0"
      >
        <MessageSquarePlus className="h-4 w-4" />
        New chat
      </Button>
      <div className="space-y-1 overflow-y-auto min-h-0">
        {sessions.map((session) => (
          <div key={session.id} className="group flex min-w-0 overflow-hidden">
            <button
              type="button"
              className={cn(
                "flex flex-1 items-center gap-1 rounded-xl px-3 py-2 text-sm cursor-pointer transition-all min-w-0 overflow-hidden text-left",
                activeSessionId === session.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => handleSelectSession(session.id)}
            >
              <span className="min-w-0 flex-1 truncate leading-snug">{session.title}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                deleteSessionMutation.mutate(session.id)
              }}
              className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded hover:text-destructive shrink-0 self-center"
              aria-label="Delete chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  )

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader
        title="Coach"
        subtitle={activeSession?.title?.toUpperCase()}
        action={
          <>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearHistoryMutation.mutate()}
                disabled={clearHistoryMutation.isPending}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="md:hidden"
              onClick={() => setSheetOpen(true)}
            >
              <MessagesSquare className="h-4 w-4" />
              Chats
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="hidden md:inline-flex lg:hidden"
              aria-expanded={listOpen}
              onClick={() => setListOpen((o) => !o)}
            >
              <MessagesSquare className="h-4 w-4" />
              Chats
            </Button>
          </>
        }
      />

      {/* ≥ md: collapsible sessions tile */}
      {listOpen && (
        <Card className="hidden md:flex lg:hidden flex-col gap-2 max-h-52 mb-3 shrink-0">
          {sessionList}
        </Card>
      )}

      {/* Phone: bottom sheet */}
      <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col gap-2 rounded-t-[20px] bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden"
          >
            <Dialog.Title className="text-lg font-semibold">Chats</Dialog.Title>
            {sessionList}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex flex-1 min-h-0 gap-4">
        {/* ≥ lg: permanent sessions column */}
        <Card
          data-testid="coach-sessions"
          className="hidden lg:flex w-64 shrink-0 flex-col gap-2 self-start max-h-full"
        >
          {sessionList}
        </Card>
        <div className="flex flex-1 min-w-0 min-h-0 flex-col">
          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            <div className="space-y-3">
              {messages.length === 0 && !isStreaming && (
                <div className="text-center text-muted-foreground py-16">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-metric-coach/15 mx-auto mb-4">
                    <Bot className="h-7 w-7 text-metric-coach" />
                  </div>
                  <p className="text-base font-medium text-foreground">Start a conversation</p>
                  <p className="text-sm mt-1">Ask about your training, recovery, or goals</p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={msg.id} className={cn("flex", msg.role === "user" && "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-[20px] px-4 py-3 text-sm",
                      msg.role === "user" ? "bg-metric-coach/15 text-foreground" : "bg-card"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none text-foreground">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {/* Retry button on last user message when request failed */}
                    {msg.role === "user" && failedMessage && i === messages.length - 1 ? (
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Failed to send</span>
                        <button
                          type="button"
                          onClick={() => handleSend(failedMessage)}
                          className="flex items-center gap-1 text-xs text-foreground bg-foreground/10 hover:bg-foreground/15 rounded-lg px-2 py-1 transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" /> Retry
                        </button>
                      </div>
                    ) : (
                      <p
                        className={cn(
                          "text-xs mt-1.5 text-muted-foreground",
                          msg.role === "user" ? "text-right" : ""
                        )}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {(isStreaming || streamingMessage) && (
                <div className="flex">
                  <div className="max-w-[85%] rounded-[20px] px-4 py-3 text-sm bg-card">
                    {streamingMessage ? (
                      <div>
                        <div className="prose prose-sm max-w-none text-foreground">
                          <Markdown>{streamingMessage}</Markdown>
                        </div>
                        {isStreaming && <span className="animate-pulse text-metric-coach">▋</span>}
                      </div>
                    ) : (
                      <div className="flex gap-1.5 items-center h-5">
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className="animate-bounce w-1.5 h-1.5 bg-metric-coach rounded-full"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input — column bottom; on phone the layout's bottom padding keeps it above the tab bar */}
          <div className="glass flex shrink-0 items-end gap-2 p-1.5 mt-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your coach anything… (Enter to send, Shift+Enter for newline)"
              className="min-h-[44px] max-h-[200px] resize-none rounded-3xl bg-transparent placeholder:text-muted-foreground"
              disabled={isStreaming || !activeSessionId}
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming || !activeSessionId}
              size="icon"
              aria-label="Send"
              className="h-11 w-11 shrink-0 rounded-full"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
