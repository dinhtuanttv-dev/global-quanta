import type { ConflictWarning } from '../../../types/taVnIndex';

export function ConflictBanner({ conflicts }: { conflicts: ConflictWarning[] }) {
  if (conflicts.length === 0) return null;

  return (
    <div className="mb-3 flex gap-2 rounded-md border border-rose-500 bg-rose-950/60 p-3 text-rose-200" role="alert">
      <span aria-hidden="true">⚠️</span>
      <div className="text-xs leading-relaxed">
        {conflicts.map((c) => (
          <p key={c.id} className="mb-1 last:mb-0">
            <b className="font-bold">Cảnh báo xung đột tín hiệu</b>
            <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">MỚI</span>
            <br />
            {c.description}
          </p>
        ))}
      </div>
    </div>
  );
}
