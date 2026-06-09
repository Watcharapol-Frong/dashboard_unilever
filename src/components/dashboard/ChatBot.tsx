'use client'

import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Bot, Sparkles, Loader2, ArrowRight } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  IconAdjustmentsHorizontal,
  IconBolt,
  IconMessageCircle,
  IconPaperclip,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";

type ChatStatus = "ready" | "submitted" | "streaming" | "error";

interface DemoMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Custom Markdown/text parser
function formatMessageText(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentTableRows: string[] = [];

  const flushTable = (key: number) => {
    if (currentTableRows.length === 0) return null;

    // Filter out rows that are just separators (contain only |, :, -, and space)
    const activeRows = currentTableRows.filter(row => {
      const clean = row.replace(/[|:\-\s]/g, "");
      return clean.length > 0;
    });

    if (activeRows.length === 0) {
      currentTableRows = [];
      return null;
    }

    // First active row is header
    const headerRow = activeRows[0];
    const headerCols = headerRow.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);

    // Remaining active rows are body
    const bodyRows = activeRows.slice(1).map(row => {
      return row.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
    });

    currentTableRows = [];

    return (
      <div key={`table-${key}`} className="my-3 overflow-x-auto border border-border rounded-lg shadow-xs bg-card">
        <table className="w-full text-[11px] text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {headerCols.map((col, idx) => (
                <th key={idx} className="px-3 py-2 font-semibold text-muted-foreground">
                  {parseBold(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {bodyRows.map((rowCols, rIdx) => (
              <tr key={rIdx} className="hover:bg-muted/5 transition-colors">
                {rowCols.map((col, cIdx) => (
                  <td key={cIdx} className="px-3 py-2 text-foreground font-medium whitespace-nowrap">
                    {parseBold(col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if it is a table row
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      currentTableRows.push(trimmed);
      continue;
    }

    // If we hit a non-table line, flush any accumulated table rows
    if (currentTableRows.length > 0) {
      const tableEl = flushTable(i);
      if (tableEl) elements.push(tableEl);
    }

    // Parse list items
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.substring(2);
      elements.push(
        <ul key={i} className="list-disc pl-4 my-1">
          <li className="text-xs leading-relaxed text-muted-foreground">{parseBold(bulletText)}</li>
        </ul>
      );
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={i} className={cn("text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap", trimmed === "" ? "h-2" : "min-h-[1em]")}>
        {parseBold(line)}
      </p>
    );
  }

  // Flush any remaining table rows
  if (currentTableRows.length > 0) {
    const tableEl = flushTable(lines.length);
    if (tableEl) elements.push(tableEl);
  }

  return elements;
}

function parseBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// Conversation Layout Components
export const Conversation = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex-1 overflow-y-auto p-4 md:p-6", className)}
      {...props}
    >
      {children}
    </div>
  );
});
Conversation.displayName = "Conversation";

export const ConversationContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-6 pl-1 pr-1 pb-2", className)}
      {...props}
    >
      {children}
    </div>
  );
});
ConversationContent.displayName = "ConversationContent";

export const ConversationScrollButton = () => null;

// Message Layout Components
const MessageContext = React.createContext<{ from: "user" | "assistant" }>({
  from: "assistant",
});

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant";
}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ from, children, className, ...props }, ref) => {
    const isAssistant = from === "assistant";
    return (
      <MessageContext.Provider value={{ from }}>
        <div
          ref={ref}
          className={cn(
            "flex gap-3 max-w-[85%] items-start",
            isAssistant ? "mr-auto" : "ml-auto flex-row-reverse",
            className
          )}
          {...props}
        >
          {isAssistant && (
            <Avatar className="w-8 h-8 shrink-0 border border-muted/80 shadow-xs bg-muted">
              <AvatarFallback className="bg-transparent text-foreground font-semibold text-xs flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex flex-col gap-1 min-w-0">
            {children}
          </div>
        </div>
      </MessageContext.Provider>
    );
  }
);
Message.displayName = "Message";

export const MessageContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  const { from } = React.useContext(MessageContext);
  const isAssistant = from === "assistant";
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl px-4 py-2.5 text-xs shadow-xs leading-relaxed break-words whitespace-pre-wrap",
        isAssistant
          ? "bg-card text-foreground rounded-tl-xs border border-border"
          : "bg-primary text-primary-foreground rounded-br-xs",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
MessageContent.displayName = "MessageContent";

export const MessageResponse = ({ children }: { children: string }) => {
  return <div className="text-pretty">{formatMessageText(children)}</div>;
};

// Prompt Input Components
export interface PromptInputProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  onSubmit: (data: { text: string }) => void;
}

export const PromptInput = React.forwardRef<HTMLFormElement, PromptInputProps>(
  ({ onSubmit, children, className, ...props }, ref) => {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const textarea = e.currentTarget.querySelector("textarea");
      if (textarea && textarea.value.trim()) {
        onSubmit({ text: textarea.value });
      }
    };

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn("w-full bg-background flex flex-col", className)}
        {...props}
      >
        {children}
      </form>
    );
  }
);
PromptInput.displayName = "PromptInput";

export const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.currentTarget.disabled) return;
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  return (
    <textarea
      ref={ref}
      rows={2}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-full resize-none bg-transparent px-4 pt-4 pb-2 text-xs focus:outline-none focus:ring-0 placeholder:text-muted-foreground min-h-[48px] max-h-[140px] overflow-y-auto border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
        className
      )}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

export const PromptInputFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
PromptInputFooter.displayName = "PromptInputFooter";

export const PromptInputTools = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    >
      {children}
    </div>
  );
});
PromptInputTools.displayName = "PromptInputTools";

export const PromptInputButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ children, className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
});
PromptInputButton.displayName = "PromptInputButton";

export interface PromptInputSubmitProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status: ChatStatus;
}

export const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  PromptInputSubmitProps
>(({ status, disabled, className, ...props }, ref) => {
  const isSubmitting = status === "submitted" || status === "streaming";
  return (
    <Button
      ref={ref}
      type="submit"
      size="icon"
      disabled={disabled || isSubmitting}
      className={cn(
        "size-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-xs shrink-0 flex items-center justify-center",
        className
      )}
      {...props}
    >
      {isSubmitting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowRight className="size-4" />
      )}
    </Button>
  );
});
PromptInputSubmit.displayName = "PromptInputSubmit";


// Main ChatBot Component
export function ChatBot() {
  const { lang: language } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<DemoMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [status, setStatus] = useState<ChatStatus>("ready")
  const [isTyping, setIsTyping] = useState(false)
  
  // Resizable width (Height is fixed to 60rem !important via CSS class)
  const [width, setWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const replyTimeoutRef = useRef<number | null>(null)
  const conversationIdRef = useRef<string>("")
  const abortControllerRef = useRef<AbortController | null>(null)

  // Initial greeting based on language
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: language === 'th'
            ? 'สวัสดีค่ะ! ยินดีต้อนรับสู่ผู้ช่วย AI สำหรับแดชบอร์ด Unilever ฉันสามารถช่วยคุณวิเคราะห์ข้อมูลภาพรวม ยอดขาย สถิติเทเลเซลส์ หรือเปรียบเทียบข้อมูลช่องทางจำหน่ายได้ทันที ถามฉันได้เลยนะคะ'
            : 'Hello! Welcome to the Unilever Dashboard AI Assistant. I can help you analyze sales data, compare channels, summarize telesales performance, and guide you through the dashboard features. Ask me anything!',
          timestamp: new Date()
        }
      ])
    }
  }, [language, messages.length])

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages, isTyping])

  useEffect(() => {
    return () => {
      if (replyTimeoutRef.current) {
        window.clearTimeout(replyTimeoutRef.current)
      }
    }
  }, [])

  // Custom resize handler (horizontal only)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    
    const startWidth = width
    const startX = e.clientX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX
      // Drag left to increase width, so we subtract dx
      const newWidth = Math.max(340, Math.min(800, startWidth - dx))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Handle message send
  const handleSend = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const tempId = `assistant-${Date.now()}`

    const newMessage: DemoMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, newMessage])
    setInputValue("")
    setStatus("submitted")
    setIsTyping(true)

    // Instantiate AbortController for cancelable fetches
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: trimmed,
          conversationId: conversationIdRef.current,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch response: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("Response body is not readable")
      }

      const decoder = new TextDecoder()
      let assistantText = ""

      // Add a placeholder message for the assistant showing a thinking state
      const thinkingText = language === 'th' ? "AI กำลังคิด..." : "AI is thinking..."
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: 'assistant',
          content: thinkingText,
          timestamp: new Date()
        }
      ])

      setIsTyping(false) // Hide general loader
      setStatus("streaming")

      let hasFirstToken = false
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.substring(6).trim()
              if (!jsonStr) continue
              const data = JSON.parse(jsonStr)

              if (data.event === "message" || data.event === "agent_message") {
                if (!hasFirstToken) {
                  hasFirstToken = true
                  assistantText = data.answer
                } else {
                  assistantText += data.answer
                }

                if (data.conversation_id) {
                  conversationIdRef.current = data.conversation_id
                }

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempId ? { ...msg, content: assistantText } : msg
                  )
                )
              }
            } catch (e) {
              // Ignore partial parsing errors
            }
          }
        }
      }

      setStatus("ready")
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const stoppedText = language === 'th'
          ? "✖️ การตอบกลับถูกหยุดโดยผู้ใช้"
          : "✖️ Response stopped by user"
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? { ...msg, content: stoppedText } : msg
          )
        )
      } else {
        console.error("Error communicating with AI assistant:", error)
        const errorText = language === 'th' 
          ? "ขออภัยด้วยค่ะ เกิดข้อผิดพลาดในการเชื่อมต่อระบบวิเคราะห์ข้อมูล กรุณาลองใหม่อีกครั้ง" 
          : "Sorry, an error occurred while connecting to the analytics assistant. Please try again."

        // Replace the placeholder bubble with the error message if it was created
        setMessages((prev) => {
          const exists = prev.some(msg => msg.id === tempId)
          if (exists) {
            return prev.map((msg) =>
              msg.id === tempId ? { ...msg, content: errorText } : msg
            )
          }
          return [
            ...prev,
            {
              id: tempId,
              role: 'assistant',
              content: errorText,
              timestamp: new Date()
            }
          ]
        })
      }
      setIsTyping(false)
      setStatus("ready")
    } finally {
      abortControllerRef.current = null
    }
  }

  // Handle stop streaming query
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }


  return (
    <div className={cn("fixed bottom-6 right-6 z-50", isResizing && "select-none")}>
      {/* Floating Action Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 relative bg-primary hover:bg-primary/90 text-primary-foreground",
          isOpen ? "rotate-90 scale-95" : "hover:scale-110"
        )}
        size="icon"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <MessageSquare className="w-6 h-6 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
          </>
        )}
      </Button>

      {/* Chat Window */}
      {isOpen && (
        <div
          style={{ width: `${width}px` }}
          className={cn(
            "fixed bottom-24 right-6 flex flex-col bg-card border border-border shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 transform origin-bottom-right animate-in fade-in slide-in-from-bottom-5",
            "!h-[60rem] !max-h-[calc(100vh-120px)] !max-w-[calc(100vw-32px)] sm:max-w-[800px]",
            isResizing && "border-primary/50 ring-1 ring-primary/25"
          )}
        >
          {/* Left Resize Drag Handle */}
          <div
            className="absolute top-0 left-0 bottom-0 w-1.5 cursor-ew-resize z-50 hover:bg-primary/10 active:bg-primary/20 transition-colors"
            onMouseDown={handleMouseDown}
            title={language === 'th' ? 'ลากเพื่อปรับความกว้าง' : 'Drag to resize width'}
          />

          <header className="flex items-center justify-between gap-4 border-b border-border/80 px-4 py-3 bg-card shrink-0">
            <div className="flex items-center gap-3 py-1">
              <div className="flex items-center gap-2 text-balance text-sm font-semibold text-foreground">
                {language === 'th' ? 'ผู้ช่วย AI ของ Unilever' : 'Unilever AI Assistant'}
                <IconSparkles className="size-4 text-amber-500 fill-amber-500 animate-pulse" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Refresh"
                title={language === 'th' ? 'รีเซ็ตการสนทนา' : 'Reset Chat'}
                onClick={() => {
                  setMessages([])
                  setStatus("ready")
                  conversationIdRef.current = ""
                }}
              >
                <IconRefresh className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Close"
                title={language === 'th' ? 'ปิด' : 'Close'}
                onClick={() => setIsOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>

          <Conversation className="bg-muted/30">
            <ConversationContent className="gap-6 pl-1">
              {messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent
                    className={cn(
                      "leading-relaxed",
                      message.role === "assistant" && "max-w-prose"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <MessageResponse>{message.content}</MessageResponse>
                    ) : (
                      <p className="whitespace-pre-wrap text-pretty">
                        {message.content}
                      </p>
                    )}
                  </MessageContent>
                </Message>
              ))}
              {isTyping && (
                <Message from="assistant">
                  <MessageContent className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground animate-pulse text-xs">
                      {language === 'th' ? 'กำลังวิเคราะห์ข้อมูล...' : 'Analyzing data...'}
                    </span>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>


          <div className="bg-background">
            <PromptInput
              onSubmit={(message) => handleSend(message.text)}
              className="w-full [&>[data-slot=input-group]]:rounded-none [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:border-t [&>[data-slot=input-group]]:border-x-0 [&>[data-slot=input-group]]:border-b-0 [&>[data-slot=input-group]]:border-border/80 [&>[data-slot=input-group]]:focus-within:ring-0 [&>[data-slot=input-group]]:focus-within:ring-transparent [&>[data-slot=input-group]]:focus-within:ring-offset-0 [&>[data-slot=input-group]]:focus-within:border-border/80 [&>[data-slot=input-group]]:focus-within:outline-none"
            >
              <PromptInputTextarea
                placeholder={
                  status !== "ready"
                    ? (language === 'th' ? 'กรุณารอการตอบกลับจาก AI...' : 'Please wait for AI response...')
                    : (language === 'th' ? 'ถามเกี่ยวกับยอดขายภาพรวม ช่องทางขาย หรือตัวแทน...' : 'Ask about sales, channels, or agents...')
                }
                value={inputValue}
                onChange={(event) => setInputValue(event.currentTarget.value)}
                disabled={status !== "ready"}
              />
              <PromptInputFooter className="justify-end">
                {status !== "ready" ? (
                  <Button
                    type="button"
                    size="icon"
                    onClick={handleStop}
                    className="size-8 rounded-lg border border-rose-500 bg-transparent text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 transition-all shadow-xs shrink-0 flex items-center justify-center"
                    title={language === 'th' ? 'หยุดทำงาน' : 'Stop generating'}
                  >
                    <span className="size-2.5 bg-current rounded-sm" />
                  </Button>
                ) : (
                  <PromptInputSubmit
                    status={status}
                    disabled={!inputValue.trim() || status !== "ready"}
                  />
                )}
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      )}
    </div>
  )
}
