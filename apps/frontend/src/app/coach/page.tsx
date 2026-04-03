"use client"

import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { api, streamPost } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Send, Trash2, User } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

export default function CoachPage() {
  const qc = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")
  const [streamingMessage, setStreamingMessage] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)

  const { data: historyData } = useQuery<{ messages: Message[] }>({
    queryKey: ["chat-history"],
    queryFn: () => api.get("/ai/chat/history"),
  })

  const messages = historyData?.messages ?? []

  // biome-ignore lint/correctness/useExhaustiveDependencies: bottomRef.current is a DOM ref, intentionally excluded
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingMessage])

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return
    const message = input.trim()
    setInput("")
    setStreamingMessage("")
    setIsStreaming(true)

    try {
      await streamPost("/ai/chat", { message }, (text) => {
        setStreamingMessage((prev) => prev + text)
      })
      await qc.invalidateQueries({ queryKey: ["chat-history"] })
      setStreamingMessage("")
    } finally {
      setIsStreaming(false)
    }
  }

  const handleClear = async () => {
    if (!confirm("Clear all chat history?")) return
    await api.delete("/ai/chat/history")
    qc.invalidateQueries({ queryKey: ["chat-history"] })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" /> AI Coach
          </h1>
          <p className="text-muted-foreground text-sm">Powered by Claude</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4" />
            Clear history
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 py-4">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center text-muted-foreground py-12">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Start a conversation</p>
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
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
              >
                {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-3 text-sm",
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
              >
                {msg.role === "assistant" ? (
                  <Markdown>{msg.content}</Markdown>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                <p
                  className={cn("text-xs mt-1 opacity-60", msg.role === "user" ? "text-right" : "")}
                >
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {(isStreaming || streamingMessage) && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[80%] rounded-lg px-4 py-3 text-sm bg-muted">
                {streamingMessage ? (
                  <div>
                    <Markdown>{streamingMessage}</Markdown>
                    {isStreaming && <span className="animate-pulse">▋</span>}
                  </div>
                ) : (
                  <div className="flex gap-1 items-center h-5">
                    <span className="animate-bounce delay-0 w-1.5 h-1.5 bg-muted-foreground rounded-full" />
                    <span className="animate-bounce delay-150 w-1.5 h-1.5 bg-muted-foreground rounded-full" />
                    <span className="animate-bounce delay-300 w-1.5 h-1.5 bg-muted-foreground rounded-full" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="pt-4 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach anything… (Enter to send, Shift+Enter for newline)"
            className="min-h-[56px] max-h-[200px] resize-none"
            disabled={isStreaming}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="h-14 w-14"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
