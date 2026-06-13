'use client'

import * as React from 'react'
import { useState, useRef, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Bot, Sparkles, ArrowRight, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

// Recharts cannot run on the server — dynamic import with ssr:false is required
const ChartBlock = dynamic(() => import('./ChartBlock'), { ssr: false })

type ChartPayload = {
  type: 'bar' | 'line' | 'pie'
  title: string
  xKey: string
  yKey: string
  data: Record<string, unknown>[]
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  chart?: ChartPayload
  error?: boolean
}

const SUGGESTED_QUESTIONS = [
  'ยอดขาย HOC แต่ละเดือนเป็นอย่างไร?',
  'CMG ไหนมียอดขายสูงสุด?',
  'อัตราการ Conversion ของแต่ละ Agent?',
  'ROI เดือนล่าสุดเป็นเท่าไร?',
]

function formatMessageText(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let tableRows: string[] = []

  const flushTable = (key: number) => {
    if (tableRows.length === 0) return
    const active = tableRows.filter((r) => r.replace(/[|:\-\s]/g, '').length > 0)
    if (active.length === 0) { tableRows = []; return }
    const headerCols = active[0].split('|').map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
    const bodyRows = active.slice(1).map((r) =>
      r.split('|').map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
    )
    tableRows = []
    elements.push(
      <div key={`table-${key}`} className="my-3 overflow-x-auto border border-border rounded-lg bg-card">
        <table className="w-full text-[11px] text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {headerCols.map((col, i) => (
                <th key={i} className="px-3 py-2 font-semibold text-muted-foreground">{parseBold(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {bodyRows.map((cols, ri) => (
              <tr key={ri} className="hover:bg-muted/5 transition-colors">
                {cols.map((col, ci) => (
                  <td key={ci} className="px-3 py-2 text-foreground font-medium whitespace-nowrap">{parseBold(col)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      tableRows.push(trimmed)
      continue
    }
    if (tableRows.length > 0) flushTable(i)

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <ul key={i} className="list-disc pl-4 my-1">
          <li className="text-xs leading-relaxed text-muted-foreground">{parseBold(trimmed.substring(2))}</li>
        </ul>
      )
      continue
    }

    elements.push(
      <p key={i} className={cn('text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap', trimmed === '' ? 'h-2' : 'min-h-[1em]')}>
        {parseBold(line)}
      </p>
    )
  }
  if (tableRows.length > 0) flushTable(lines.length)
  return elements
}

function parseBold(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : part
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

export function AiAssistantClient() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // Build history for context (exclude error messages, limit to last 20)
    const history = messages
      .filter((m) => !m.error)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: err.error ?? 'An error occurred. Please try again.',
            error: true,
          },
        ])
        return
      }

      const data = await res.json() as { text: string; chart?: ChartPayload }
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.text,
          chart: data.chart,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
          error: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">AI Analytics Assistant</h1>
            <p className="text-[11px] text-muted-foreground">Powered by Claude · Unilever HOC Data</p>
          </div>
        </div>
        {!isEmpty && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
            onClick={() => setMessages([])}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear chat
          </Button>
        )}
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted/20 px-4 py-6">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-xl mx-auto">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">สวัสดี! ฉันคือ AI Assistant</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  ถามฉันเกี่ยวกับข้อมูล HOC ยอดขาย หรือประสิทธิภาพ Telesales ได้เลย
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/60 hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3 items-start',
                  msg.role === 'user' ? 'flex-row-reverse ml-auto max-w-[75%]' : 'mr-auto w-full'
                )}
              >
                {msg.role === 'assistant' && (
                  <Avatar className="w-8 h-8 shrink-0 border border-muted/80 bg-muted mt-0.5">
                    <AvatarFallback className="bg-transparent">
                      <Bot className="w-4 h-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className={cn('flex flex-col gap-2 min-w-0', msg.role === 'user' ? 'items-end' : 'items-start flex-1')}>
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-2.5 text-xs shadow-xs leading-relaxed break-words',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-xs'
                        : cn(
                            'bg-card border border-border rounded-tl-xs',
                            msg.error && 'border-destructive/40 bg-destructive/5 text-destructive'
                          )
                    )}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="text-pretty">{formatMessageText(msg.content)}</div>
                    )}
                  </div>

                  {msg.chart && (
                    <div className="w-full max-w-2xl">
                      <ChartBlock chart={msg.chart} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 items-start mr-auto">
                <Avatar className="w-8 h-8 shrink-0 border border-muted/80 bg-muted mt-0.5">
                  <AvatarFallback className="bg-transparent">
                    <Bot className="w-4 h-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-card border border-border rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs">
                  <ThinkingDots />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border/80 bg-background px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-4 py-2 shadow-xs focus-within:border-primary/40 transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder={isLoading ? 'กำลังวิเคราะห์ข้อมูล...' : 'ถามเกี่ยวกับยอดขาย, CMG, agent หรือ ROI... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)'}
              className="flex-1 resize-none bg-transparent text-xs focus:outline-none focus:ring-0 placeholder:text-muted-foreground min-h-[32px] max-h-[140px] overflow-y-auto py-1.5 border-0 focus-visible:ring-0"
            />
            <Button
              size="icon"
              disabled={!input.trim() || isLoading}
              onClick={() => sendMessage(input)}
              className="size-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 flex items-center justify-center mb-0.5"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            AI สามารถเข้าถึงข้อมูล HOC จริงจากฐานข้อมูล · ตอบได้ทั้งภาษาไทยและอังกฤษ
          </p>
        </div>
      </div>
    </div>
  )
}
