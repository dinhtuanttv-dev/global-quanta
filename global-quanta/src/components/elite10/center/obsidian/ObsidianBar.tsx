// Thanh Bàn nghiên cứu Obsidian (một dòng, đầu Phòng họp AI): Vault · thư mục · Cấu hình · số kết quả chưa lưu · vùng thông báo riêng.
import { useState, type ReactNode } from "react";
import { BookMarked, Settings2 } from "lucide-react";
import VaultSettings from "./VaultSettings";
import ExportMenu from "./ExportMenu";
import { buildVaultKit } from "../../../../lib/obsidian/vaultKit";
import type { ObsidianDesk } from "./useObsidianDesk";

export default function ObsidianBar({ desk, unsaved, extra }: { desk: ObsidianDesk; unsaved: string[]; extra?: ReactNode }) {
  const [settings, setSettings] = useState(false);
  const tone = desk.status?.tone === "error" ? "text-rose-300" : desk.status?.tone === "warn" ? "text-amber-200" : "text-emerald-300";
  return (
    <section aria-label="Bàn nghiên cứu Obsidian" data-testid="obsidian-bar"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-white/10 bg-[#0E131F] px-3 py-2 text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-q-accent-strong"><BookMarked className="h-3.5 w-3.5" aria-hidden />Obsidian</span>
      <span className="text-slate-200" data-testid="obsidian-target">
        Vault: <b className="font-semibold text-slate-100">{desk.prefs.vault || "Vault đang mở"}</b>
        <span className="text-slate-300"> · </span>
        <span className="text-slate-100" style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{desk.prefs.folder || "(gốc Vault)"}</span>
      </span>
      <button type="button" onClick={() => setSettings(true)} data-testid="obsidian-settings-open"
        className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-white/20 px-2.5 text-[11px] text-slate-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-q-accent-strong">
        <Settings2 className="h-3.5 w-3.5" aria-hidden />Cấu hình
      </button>
      <ExportMenu label="Gói khởi tạo Vault" testId="obsidian-kit" items={[
        { id: "obsidian", label: "Mở trong Obsidian", hint: "Ghi chú “Elite 10 · Bàn điều khiển”: bảng Dataview + 3 mẫu ghi chú", onSelect: () => void desk.run(buildVaultKit(desk.prefs.folder), "obsidian", "kit") },
        { id: "download", label: "Tải .md", onSelect: () => void desk.run(buildVaultKit(desk.prefs.folder), "download", "kit") },
        { id: "copy", label: "Sao chép Markdown", onSelect: () => void desk.run(buildVaultKit(desk.prefs.folder), "copy", "kit") },
      ]} />
      {extra}
      {unsaved.length > 0 && (
        <span className="rounded border border-amber-300/40 px-1.5 py-0.5 text-amber-100" data-testid="obsidian-unsaved">
          {unsaved.length} kết quả chưa lưu ({unsaved.join(", ")}) — rời tab QUYẾT ĐỊNH sẽ mất kết quả
        </span>
      )}
      <p role="status" aria-live="polite" className={`basis-full text-[11px] ${tone} empty:hidden`} data-testid="obsidian-status">{desk.status?.text ?? ""}</p>
      {settings && <VaultSettings desk={desk} onClose={() => setSettings(false)} />}
    </section>
  );
}
