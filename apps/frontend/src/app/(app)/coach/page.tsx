"use client"

import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { api, streamPost } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Menu, MessageSquarePlus, Send, Trash2, User, X } from "lucide-react"
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
  const [isStreaming, setIsStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
      setSidebarOpen(false)
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
    setSidebarOpen(false)
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !activeSessionId) return
    const message = input.trim()
    setInput("")
    setStreamingMessage("")
    setIsStreaming(true)

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

    try {
      await streamPost("/ai/chat", { message, sessionId: activeSessionId }, (text) => {
        setStreamingMessage((prev) => prev + text)
      })
      await qc.invalidateQueries({ queryKey: ["chat-history", activeSessionId] })
      await qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      setStreamingMessage("")
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

  const SessionList = () => (
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
      <ScrollArea className="flex-1">
        <div className="space-y-1 pr-1">
          {sessions.map((session) => (
            <div key={session.id} className="group flex min-w-0 overflow-hidden">
              <button
                type="button"
                className={cn(
                  "flex flex-1 items-center gap-1 rounded-xl px-3 py-2 text-sm cursor-pointer transition-all min-w-0 overflow-hidden text-left",
                  activeSessionId === session.id
                    ? "bg-primary/10 text-primary border border-primary/18"
                    : "text-foreground/60 hover:bg-white/30 hover:text-foreground"
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
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-destructive shrink-0 self-center mr-1"
                aria-label="Delete chat"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </>
  )

  return (
    <div className="flex flex-1 min-h-0 gap-4 relative">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setSidebarOpen(false)}
          role="presentation"
        />
      )}

      {/* Sidebar — slide-in on mobile, always visible on md+ */}
      <aside
        className={cn(
          "flex flex-col gap-2 z-50 transition-transform duration-200",
          // Mobile: fixed overlay panel
          "fixed top-14 bottom-0 left-0 w-64 p-3 glass-strong md:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: static in flow
          "md:static md:translate-x-0 md:w-52 md:p-0 md:bg-transparent md:backdrop-filter-none md:border-0 md:shadow-none md:flex"
        )}
      >
        <SessionList />
      </aside>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 pb-3 border-b border-black/8 mb-3">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 h-8 w-8"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>

          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2 min-w-0 flex-1">
            <Bot className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{activeSession?.title ?? "AI Coach"}</span>
          </h1>

          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearHistoryMutation.mutate()}
              disabled={clearHistoryMutation.isPending}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 py-2 overflow-y-auto">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && !isStreaming && (
              <div className="text-center text-muted-foreground py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mx-auto mb-4">
                  <Bot className="h-7 w-7 text-primary/60" />
                </div>
                <p className="text-base font-medium text-foreground/60">Start a conversation</p>
                <p className="text-sm mt-1">Ask about your training, recovery, or goals</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                    msg.role === "user"
                      ? "bg-primary text-white shadow-[0_2px_8px_rgba(59,130,246,0.35)]"
                      : "bg-white/30 border border-white/40 text-muted-foreground"
                  )}
                >
                  {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-white shadow-[0_2px_12px_rgba(59,130,246,0.3)]"
                      : "glass-card"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-foreground/85">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                  <p
                    className={cn(
                      "text-xs mt-1.5 opacity-40",
                      msg.role === "user" ? "text-right" : ""
                    )}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}

            {(isStreaming || streamingMessage) && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/30 border border-white/40 text-muted-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm glass-card">
                  {streamingMessage ? (
                    <div>
                      <div className="prose prose-sm max-w-none text-foreground/85">
                        <Markdown>{streamingMessage}</Markdown>
                      </div>
                      {isStreaming && <span className="animate-pulse text-primary">▋</span>}
                    </div>
                  ) : (
                    <div className="flex gap-1.5 items-center h-5">
                      <span
                        className="animate-bounce w-1.5 h-1.5 bg-primary rounded-full"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="animate-bounce w-1.5 h-1.5 bg-primary rounded-full"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="animate-bounce w-1.5 h-1.5 bg-primary rounded-full"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="pt-3 border-t border-black/8">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your coach anything… (Enter to send, Shift+Enter for newline)"
              className="min-h-[52px] max-h-[200px] resize-none rounded-2xl placeholder:text-muted-foreground/60"
              disabled={isStreaming || !activeSessionId}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || !activeSessionId}
              size="icon"
              className="h-[52px] w-[52px] rounded-2xl shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
