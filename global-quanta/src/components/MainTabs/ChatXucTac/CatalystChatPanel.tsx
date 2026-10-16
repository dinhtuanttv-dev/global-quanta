// X4 — "Hỏi đáp xúc tác": chat với Claude (Opus 5.5) có công cụ vĩ mô (Gateway) + xúc tác (snapshot engine).
// Trung thực theo thiết kế: biểu ngữ notice (dữ liệu mô phỏng/cũ) đứng ĐẦU câu trả lời; thẻ kết quả lấy từ chính tool_result;
// con số không truy được tới công cụ -> cảnh báo hiển thị; không khuyến nghị mua/bán.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Loader2, Send, Square, Wrench } from "lucide-react";
import { ChatHttpError, streamCatalystChat, type ChatStreamEvent, type ChatToolResult } from "../../../services/catalystChat";
import { ToolResultCard, toolLabel } from "./CatalystChatCards";
import { MarkdownLite } from "../../shared/MarkdownLite";

interface ToolRun { id: string; name: string; result?: ChatToolResult }
interface AssistantTurn {
  role: "assistant";
  text: string;
  notices: string[];
  tools: ToolRun[];
  untraceable: string[];
  error?: string;
  done: boolean;
  fallback?: boolean;
}
type Turn = { role: "user"; text: string } | AssistantTurn;

const SUGGESTIONS = [
  "Vĩ mô đang thuận lợi hay bất lợi cho VN-Index?",
  "Đang có chất xúc tác gì nổi bật? Ngành nào hưởng lợi?",
  "Sắp có số liệu vĩ mô hay sự kiện gì cần chú ý?",
  "Lạm phát ảnh hưởng gì tới VNSmallcap?",
  "Nếu VND mất giá 3% thì chỉ số nào chịu thiệt?",
  "Mã HPG đang có xúc tác gì?",
  "Yếu tố thế giới nào tác động tới ngành ngân hàng? Bằng chứng bậc mấy?",
  "Thị trường Việt Nam đang nhận lan truyền từ đâu?",
  "Thuế đối ứng của Mỹ tháng 4/2025 tác động ngành nào?",
];

function Banner({ tone, children }: { tone: "warn" | "info"; children: ReactNode }) {
  const c = tone === "warn" ? "var(--warning, #f59e0b)" : "var(--text-tertiary)";
  return (
    <div role="note" style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11, color: c, background: `color-mix(in srgb, ${c} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, borderRadius: 6, padding: "5px 8px", margin: "0 0 6px" }}>
      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

function AssistantBubble({ t }: { t: AssistantTurn }) {
  return (
    <div style={{ alignSelf: "stretch", minWidth: 0 }}>
      {t.notices.map((n) => <Banner key={n} tone="warn">{n}</Banner>)}
      {t.tools.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "0 0 6px" }}>
          {t.tools.map((r) => (
            <span key={r.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 7px", borderRadius: 10, border: "1px solid var(--border)", color: r.result && !r.result.ok ? "var(--negative, #f87171)" : "var(--text-tertiary)" }}>
              {r.result ? <Wrench size={10} /> : <Loader2 size={10} style={{ opacity: 0.6 }} />}
              {toolLabel(r.name)}{r.result && !r.result.ok ? " · lỗi" : ""}
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-primary)" }}>
        {t.text ? <MarkdownLite text={t.text} /> : !t.done && <span style={{ color: "var(--text-tertiary)" }}>Đang phân tích…</span>}
      </div>
      {t.tools.map((r) => (r.result ? <ToolResultCard key={`c${r.id}`} name={r.name} result={r.result} /> : null))}
      {t.untraceable.length > 0 && (
        <Banner tone="info">Có {t.untraceable.length} con số không truy được tới dữ liệu công cụ ({t.untraceable.slice(0, 5).join(", ")}) — hãy kiểm tra lại trước khi dùng.</Banner>
      )}
      {t.error && <Banner tone="warn">{t.error}</Banner>}
      {t.done && !t.error && (
        <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", marginTop: 4 }}>
          Thông tin tham khảo, không phải khuyến nghị đầu tư.{t.fallback ? " (Trả lời bởi mô hình dự phòng.)" : ""}
        </div>
      )}
    </div>
  );
}

export default function CatalystChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ remaining: number; macroMode: string | null; worldMode: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLast = (fn: (a: AssistantTurn) => AssistantTurn) =>
    setTurns((ts) => {
      const last = ts[ts.length - 1];
      return last && last.role === "assistant" ? [...ts.slice(0, -1), fn(last)] : ts;
    });

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = turns
      .filter((t) => (t.role === "user" ? true : t.done && !t.error && t.text.trim()))
      .map((t) => ({ role: t.role, content: t.text }));
    // API yêu cầu xen kẽ: bỏ câu hỏi cuối chưa có trả lời hợp lệ
    while (history.length && history[history.length - 1].role === "user") history.pop();
    setTurns((ts) => [...ts, { role: "user", text: q }, { role: "assistant", text: "", notices: [], tools: [], untraceable: [], done: false }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const onEvent = (e: ChatStreamEvent) => {
      if (e.type === "meta") setMeta({ remaining: e.remaining, macroMode: e.macroMode, worldMode: e.worldMode ?? null });
      else if (e.type === "text") updateLast((a) => ({ ...a, text: a.text + e.delta }));
      else if (e.type === "notice") updateLast((a) => (a.notices.includes(e.notice) ? a : { ...a, notices: [...a.notices, e.notice] }));
      else if (e.type === "tool_call") updateLast((a) => ({ ...a, tools: [...a.tools, { id: e.id, name: e.name }] }));
      else if (e.type === "tool_result") updateLast((a) => ({ ...a, tools: a.tools.map((r) => (r.id === e.id ? { ...r, result: e.result } : r)) }));
      else if (e.type === "audit") updateLast((a) => ({ ...a, untraceable: e.untraceable }));
      else if (e.type === "error") updateLast((a) => ({ ...a, error: e.message }));
      else if (e.type === "done") updateLast((a) => ({ ...a, done: true, fallback: e.fallback }));
    };
    try {
      await streamCatalystChat([...history, { role: "user", content: q }], onEvent, ctrl.signal);
    } catch (err) {
      const msg = ctrl.signal.aborted ? "Đã dừng." : err instanceof ChatHttpError ? err.message : "Không kết nối được dịch vụ hỏi đáp.";
      updateLast((a) => ({ ...a, error: msg }));
    } finally {
      updateLast((a) => ({ ...a, done: true }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
        <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Hỏi đáp xúc tác</span>
        <span>· Claude Opus 5.5 · công cụ vĩ mô + thế giới + xúc tác</span>
        {meta?.macroMode === "synthetic" && <span style={{ color: "var(--warning, #f59e0b)" }}>· vĩ mô đang dùng dữ liệu MÔ PHỎNG</span>}
        {meta?.worldMode === "synthetic" && <span style={{ color: "var(--warning, #f59e0b)" }}>· Kết nối thế giới đang dùng dữ liệu MÔ PHỎNG</span>}
        {meta && <span style={{ marginLeft: "auto" }}>Còn {meta.remaining} câu hôm nay</span>}
      </div>

      {turns.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => void ask(s)} disabled={busy}
              style={{ fontSize: 11, padding: "6px 10px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", textAlign: "left" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {turns.map((t, i) => t.role === "user" ? (
          <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", fontSize: 12.5, background: "color-mix(in srgb, var(--gold, #e8b84b) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--gold, #e8b84b) 30%, transparent)", borderRadius: "10px 10px 2px 10px", padding: "7px 10px", color: "var(--text-primary)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {t.text}
          </div>
        ) : <AssistantBubble key={i} t={t} />)}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", position: "sticky", bottom: 0, background: "var(--bg-base, #0a0d12)", paddingTop: 6 }}>
        <textarea
          aria-label="Câu hỏi về chất xúc tác hoặc vĩ mô"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 2000))}
          onKeyDown={onKey}
          rows={2}
          placeholder="Hỏi về chất xúc tác, ngành, mã hoặc vĩ mô… (Enter để gửi)"
          style={{ flex: 1, minWidth: 0, resize: "vertical", fontSize: 12.5, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", fontFamily: "inherit" }}
        />
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Dừng" style={{ height: 38, width: 38, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <Square size={14} />
          </button>
        ) : (
          <button type="button" onClick={() => void ask(input)} disabled={!input.trim()} aria-label="Gửi" style={{ height: 38, width: 38, borderRadius: 8, border: 0, background: "var(--gold, #e8b84b)", color: "var(--bg-base, #0a0d12)", cursor: input.trim() ? "pointer" : "default", opacity: input.trim() ? 1 : 0.5, display: "grid", placeItems: "center" }}>
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
