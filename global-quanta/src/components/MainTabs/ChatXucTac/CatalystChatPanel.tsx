// X4/Z3 — "Hỏi đáp vĩ mô & thị trường" (trước 31/10/2026: Hỏi đáp xúc tác): Claude (Opus 5.5) hoặc Gemini, hoặc SO SÁNH hai mô hình cạnh nhau — cùng bộ công cụ vĩ mô (Gateway),
// Kết nối thế giới (world_*), ngành thế giới → ngành ICB VN (ws_*: chiến lược, ngành, hàng hoá, phơi nhiễm cổ phiếu) và xúc tác.
// Trung thực theo thiết kế: biểu ngữ notice (dữ liệu mô phỏng/cũ) đứng ĐẦU câu trả lời; thẻ kết quả lấy từ chính tool_result;
// con số không truy được tới công cụ -> cảnh báo hiển thị; không khuyến nghị mua/bán.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Loader2, Send, Square, Wrench } from "lucide-react";
import { ChatHttpError, streamCatalystChat, type ChatProvider, type ChatStreamEvent, type ChatToolResult } from "../../../services/catalystChat";
import { ToolResultCard, toolLabel } from "./CatalystChatCards";
import { MarkdownLite } from "../../shared/MarkdownLite";

interface ToolRun { id: string; name: string; result?: ChatToolResult }
export interface Lane {
  provider: ChatProvider;
  model?: string;
  text: string;
  notices: string[];
  tools: ToolRun[];
  untraceable: string[];
  error?: string;
  done: boolean;
  fallback?: boolean;
}
interface AssistantTurn { role: "assistant"; lanes: Lane[] }
type Turn = { role: "user"; text: string } | AssistantTurn;
type Mode = ChatProvider | "compare";

const MODES: { id: Mode; label: string; title: string }[] = [
  { id: "claude", label: "Claude", title: "Claude Opus 5.5 — gọi công cụ, suy luận sâu" },
  { id: "gemini", label: "Gemini", title: "Gemini — gọi công cụ (function calling), cùng bộ công cụ & kiểm tra con số" },
  { id: "compare", label: "So sánh 2 mô hình", title: "Hỏi cả Claude và Gemini cùng lúc, hiện cạnh nhau (tính 2 câu vào hạn mức)" },
];
const PROVIDER_VI: Record<ChatProvider, string> = { claude: "Claude", gemini: "Gemini" };

export const SUGGESTIONS = [
  "Ngành nào thuận gió / ngược gió phiên tới? Lợi thế lớn cỡ nào?",
  "HPG chịu tác động thế giới thế nào? Hàng hoá nào dẫn dắt?",
  "Dầu Brent tăng thì ngành và cổ phiếu Việt Nam nào bị ảnh hưởng?",
  "Vĩ mô đang thuận lợi hay bất lợi cho VN-Index?",
  "Sắp có số liệu vĩ mô hay sự kiện gì cần chú ý?",
  "Bối cảnh trung hạn của ngành ngân hàng ra sao (thế giới, RRG, truyền dẫn)?",
  "Giá gạo Việt Nam và quặng sắt đang ở đâu so với 5 năm?",
  "Yếu tố thế giới nào tác động tới ngành ngân hàng? Bằng chứng bậc mấy?",
];

export const newLane = (provider: ChatProvider): Lane => ({ provider, text: "", notices: [], tools: [], untraceable: [], done: false });

/** Áp một sự kiện stream vào làn trả lời (hàm thuần — dùng chung cho Hỏi đáp và Phòng họp AI Elite 10). */
export function laneReducer(a: Lane, e: ChatStreamEvent): Lane {
  switch (e.type) {
    case "meta": return { ...a, model: e.model };
    case "text": return { ...a, text: a.text + e.delta };
    case "notice": return a.notices.includes(e.notice) ? a : { ...a, notices: [...a.notices, e.notice] };
    case "tool_call": return { ...a, tools: [...a.tools, { id: e.id, name: e.name }] };
    case "tool_result": return { ...a, tools: a.tools.map((r) => (r.id === e.id ? { ...r, result: e.result } : r)) };
    case "audit": return { ...a, untraceable: e.untraceable };
    case "error": return { ...a, error: e.message };
    case "done": return { ...a, done: true, fallback: e.fallback };
    default: return a;
  }
}

function Banner({ tone, children }: { tone: "warn" | "info"; children: ReactNode }) {
  const c = tone === "warn" ? "var(--warning, #f59e0b)" : "var(--text-tertiary)";
  return (
    <div role="note" style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11, color: c, background: `color-mix(in srgb, ${c} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, borderRadius: 6, padding: "5px 8px", margin: "0 0 6px" }}>
      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

export function LaneView({ t, showHeader, headerLabel }: { t: Lane; showHeader: boolean; headerLabel?: string }) {
  return (
    <div style={{ minWidth: 0 }} data-testid={`lane-${t.provider}`}>
      {showHeader && (
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--gold, #e8b84b)", marginBottom: 4 }}>
          {headerLabel ?? PROVIDER_VI[t.provider]}{t.model ? <span style={{ color: "var(--text-tertiary)", fontWeight: 400, textTransform: "none" }}> · {t.model}</span> : null}
        </div>
      )}
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

/** Lịch sử cho một mô hình: câu trả lời của chính mô hình đó (hoặc làn đầu tiên nếu lượt trước không hỏi mô hình này). */
export function historyFor(turns: Turn[], provider: ChatProvider): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    if (t.role === "user") { out.push({ role: "user", content: t.text }); continue; }
    const lane = t.lanes.find((l) => l.provider === provider) ?? t.lanes[0];
    if (lane && lane.done && !lane.error && lane.text.trim()) out.push({ role: "assistant", content: lane.text });
    else out.pop(); // câu hỏi không có trả lời hợp lệ -> bỏ (API yêu cầu xen kẽ)
  }
  while (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

export default function CatalystChatPanel({ seedQuestion, onSeedConsumed, suggestions = SUGGESTIONS, title = "Hỏi đáp vĩ mô & thị trường" }: { seedQuestion?: string | null; onSeedConsumed?: () => void; suggestions?: string[]; title?: string } = {}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("claude");
  const [meta, setMeta] = useState<{ remaining: number; macroMode: string | null; worldMode: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLane = (provider: ChatProvider, fn: (a: Lane) => Lane) =>
    setTurns((ts) => {
      const last = ts[ts.length - 1];
      if (!last || last.role !== "assistant") return ts;
      return [...ts.slice(0, -1), { ...last, lanes: last.lanes.map((l) => (l.provider === provider ? fn(l) : l)) }];
    });

  async function runLane(provider: ChatProvider, q: string, prior: Turn[], ctrl: AbortController) {
    const onEvent = (e: ChatStreamEvent) => {
      if (e.type === "meta") setMeta({ remaining: e.remaining, macroMode: e.macroMode, worldMode: e.worldMode ?? null });
      updateLane(provider, (a) => laneReducer(a, e));
    };
    try {
      await streamCatalystChat([...historyFor(prior, provider), { role: "user", content: q }], onEvent, ctrl.signal, provider);
    } catch (err) {
      const msg = ctrl.signal.aborted ? "Đã dừng." : err instanceof ChatHttpError ? err.message : "Không kết nối được dịch vụ hỏi đáp.";
      updateLane(provider, (a) => ({ ...a, error: msg }));
    } finally {
      updateLane(provider, (a) => ({ ...a, done: true }));
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const providers: ChatProvider[] = mode === "compare" ? ["claude", "gemini"] : [mode];
    const prior = turns;
    setTurns((ts) => [...ts, { role: "user", text: q }, { role: "assistant", lanes: providers.map(newLane) }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await Promise.all(providers.map((p) => runLane(p, q, prior, ctrl)));
    setBusy(false);
    abortRef.current = null;
  }

  // câu hỏi chuyển sang từ bảng "Tác động ngành & cổ phiếu"
  useEffect(() => {
    if (seedQuestion && !busy) { void ask(seedQuestion); onSeedConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuestion]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }} data-testid="catalyst-chat">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
        <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{title}</span>
        <div role="group" aria-label="Mô hình AI" style={{ display: "flex", gap: 4 }}>
          {MODES.map((m) => (
            <button key={m.id} type="button" title={m.title} aria-pressed={mode === m.id} disabled={busy} onClick={() => setMode(m.id)}
              style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 6, border: 0, cursor: busy ? "default" : "pointer",
                background: mode === m.id ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.06)", color: mode === m.id ? "var(--gold, #e8b84b)" : "var(--text-secondary)" }}>
              {m.label}
            </button>
          ))}
        </div>
        <span>· công cụ Elite 10 + vĩ mô + thế giới + ngành ICB + hàng hoá</span>
        {meta?.macroMode === "synthetic" && <span style={{ color: "var(--warning, #f59e0b)" }}>· vĩ mô đang dùng dữ liệu MÔ PHỎNG</span>}
        {meta?.worldMode === "synthetic" && <span style={{ color: "var(--warning, #f59e0b)" }}>· Kết nối thế giới đang dùng dữ liệu MÔ PHỎNG</span>}
        {meta && <span style={{ marginLeft: "auto" }}>Còn {meta.remaining} câu hôm nay</span>}
      </div>

      {turns.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.map((s) => (
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
        ) : (
          <div key={i} style={{ display: "grid", gap: 12, gridTemplateColumns: t.lanes.length > 1 ? "repeat(auto-fit, minmax(280px, 1fr))" : "minmax(0, 1fr)" }}>
            {t.lanes.map((l) => <LaneView key={l.provider} t={l} showHeader={t.lanes.length > 1 || l.provider === "gemini"} />)}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", position: "sticky", bottom: 0, background: "var(--bg-base, #0a0d12)", paddingTop: 6 }}>
        <textarea
          aria-label="Câu hỏi về vĩ mô hoặc thị trường"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 2000))}
          onKeyDown={onKey}
          rows={2}
          placeholder="Hỏi về vĩ mô, ngành, mã hoặc hàng hoá… (Enter để gửi)"
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
