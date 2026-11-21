// Cấu hình Vault: tên hoặc ID Vault (trống = Vault đang mở), thư mục (mặc định Global Quanta/Elite 10). Kiểm hợp lệ trước khi lưu.
import { useState } from "react";
import { safeFolder, safeVault } from "../../../../lib/obsidian/note";
import { OBSIDIAN_DEFAULT_FOLDER } from "../../../../lib/obsidian/types";
import Modal from "./Modal";
import type { ObsidianDesk } from "./useObsidianDesk";

const INPUT = "w-full rounded-md border border-white/20 bg-slate-900 px-2.5 py-1.5 text-[12px] text-slate-100 outline-none focus:border-[#E8B84B]";

export default function VaultSettings({ desk, onClose }: { desk: ObsidianDesk; onClose: () => void }) {
  const [vault, setVault] = useState(desk.prefs.vault);
  const [folder, setFolder] = useState(desk.prefs.folder);
  const vOk = safeVault(vault) !== null, fOk = safeFolder(folder) !== null;
  const save = () => {
    if (!vOk || !fOk) return;
    const r = desk.setPrefs({ ...desk.prefs, vault, folder: folder.trim() });
    if (r !== "invalid-name") { desk.announce("ok", `Đã lưu cấu hình Obsidian: ${vault.trim() || "Vault đang mở"} · ${folder.trim() || "(gốc Vault)"}.`); onClose(); }
  };
  return (
    <Modal title="Cấu hình Obsidian" onClose={onClose} testId="obsidian-settings"
      footer={<>
        <button type="button" onClick={onClose} className="min-h-[32px] rounded-md border border-white/20 px-3 text-[11.5px] text-slate-200 hover:bg-white/10">Huỷ</button>
        <button type="button" onClick={save} disabled={!vOk || !fOk} data-testid="obsidian-settings-save"
          className="min-h-[32px] rounded-md bg-[#E8B84B]/25 px-3 text-[11.5px] font-semibold text-[#F5CE72] hover:bg-[#E8B84B]/35 disabled:cursor-not-allowed disabled:opacity-60">Lưu cấu hình</button>
      </>}>
      <div className="space-y-3 text-[11.5px]">
        <label className="block space-y-1">
          <span className="font-semibold text-slate-100">Tên hoặc ID Vault</span>
          <input value={vault} onChange={(e) => setVault(e.target.value)} maxLength={100} placeholder="Để trống = Vault đang mở" className={INPUT} aria-invalid={!vOk} data-testid="obsidian-vault" />
          <span className="block text-slate-300">ID là chuỗi 16 ký tự (Obsidian › chọn Vault › “Copy vault ID”). Tên Vault không phải thông tin bí mật.</span>
          {!vOk && <span role="alert" className="block text-rose-300">Tối đa 100 ký tự, không chứa ký tự điều khiển.</span>}
        </label>
        <label className="block space-y-1">
          <span className="font-semibold text-slate-100">Thư mục trong Vault</span>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} maxLength={100} placeholder={OBSIDIAN_DEFAULT_FOLDER} className={INPUT} aria-invalid={!fOk} data-testid="obsidian-folder" />
          <span className="block text-slate-300">Dùng “/” cho thư mục con. Để trống = gốc Vault.</span>
          {!fOk && <span role="alert" className="block text-rose-300">Không dùng “..” hoặc các ký tự : * ? " &lt; &gt; |.</span>}
        </label>
        <button type="button" onClick={() => setFolder(OBSIDIAN_DEFAULT_FOLDER)} className="min-h-[32px] rounded-md border border-white/15 px-2.5 text-[11px] text-slate-200 hover:bg-white/10">Dùng thư mục mặc định</button>
      </div>
    </Modal>
  );
}
