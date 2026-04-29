import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSystem } from "@/lib/system";
import { toast } from "react-hot-toast";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatAssistant() {
  const { user } = useAuth();
  const { system, label } = useSystem();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Clear chat when workspace system switches so contexts don't mix
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [system]);

  if (!user) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-assistant", {
        body: { messages: next, system },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages([...next, { role: "assistant", content: data.reply || "(no response)" }]);
    } catch (e: any) {
      toast.error(e.message ?? "Chat failed");
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
          aria-label="Open assistant"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] h-[min(80vh,560px)] rounded-xl border bg-card shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-secondary/40">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">Assistant</div>
              <div className="text-xs text-muted-foreground truncate">{label}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Ask me about your rides, drivers, routes, or invoices.</p>
                <div className="flex flex-wrap gap-2">
                  {["When is my next ride?", "How many rides this week?", "Total earned this month?", "List my routes"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="text-xs px-2 py-1 rounded-full border bg-secondary/60 hover:bg-secondary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-2xl px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
                </div>
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-3 border-t flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your rides..."
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
