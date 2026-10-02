import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useRadarModel } from '../../hooks/useRadarModel';
import { useSmartNews, type SmartNewsItem } from '../../hooks/useSmartNews';

// TIN TỨC THÔNG MINH — tin THẬT cho các mã của ★ Danh mục trên Radar (+ mã đang chọn):
// công bố thông tin chính thức, tin doanh nghiệp, Vietstock, CafeF; đã gắn mã, gộp tin trùng giữa nguồn,
// phân loại sự kiện, chấm cảm xúc, đo phản ứng giá so VN-Index và xếp theo mức quan trọng.

type Filter = 'all' | 'disclosure' | 'pos' | 'neg' | 'selected';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'disclosure', label: 'Công bố' }, { id: 'pos', label: 'Tích cực' },
  { id: 'neg', label: 'Tiêu cực' }, { id: 'selected', label: 'Mã đang chọn' },
];
const UP = '#22c55e', DOWN = '#f43f5e', FLAT = '#94a3b8', WATCH = '#f59e0b';
const PAGE = 8;

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}
const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`);
const sentGlyph = (s: number) => (s >= 0.25 ? { g: '▲', c: UP, t: 'Tích cực' } : s <= -0.25 ? { g: '▼', c: DOWN, t: 'Tiêu cực' } : { g: '●', c: FLAT, t: 'Trung tính' });

function NewsRow({ item, relevance, onTicker }: { item: SmartNewsItem; relevance: (t: string) => string | null; onTicker: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const s = sentGlyph(item.sentiment);
  const rel = item.tickers.map(relevance).find(Boolean) ?? null;
  return (
    <div className="news-item" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
        {item.tickers.slice(0, 2).map((t) => (
          <button key={t} type="button" className="news-tag" onClick={(e) => { e.stopPropagation(); onTicker(t); }} title={`Chọn ${t}`} style={{ border: 'none', cursor: 'pointer' }}>{t}</button>
        ))}
      </div>
      <div className="news-body" style={{ minWidth: 0 }}>
        <div className="news-title">
          <span style={{ color: s.c, marginRight: 4 }} title={`${s.t} (${item.sentiment.toFixed(2)})${item.sentimentHits.length ? ` · ${item.sentimentHits.join(', ')}` : ''}`}>{s.g}</span>
          {item.title}
        </div>
        <div className="news-meta" style={{ flexWrap: 'wrap', rowGap: 2 }}>
          {rel && <span className={rel === 'Core' ? 'core-relevance' : ''} style={rel !== 'Core' ? { color: '#5B8CD6', fontWeight: 600 } : undefined}>● {rel}</span>}
          <span style={{ color: 'var(--text-secondary)' }}>{item.eventLabel}</span>
          <span title={item.alsoIn.length ? `Cũng đưa tin: ${item.alsoIn.join(', ')}` : undefined}>
            {item.sourceLabel}{item.corroboration > 1 ? ` +${item.corroboration - 1} nguồn` : ''}
          </span>
          <span>{timeAgo(item.publishedAt)}</span>
          <span title="Mức quan trọng: loại sự kiện × độ tin cậy nguồn × độ mới × cường độ cảm xúc × xác nhận chéo × phản ứng khối lượng">⚑ {item.importance}</span>
        </div>
        {item.insight && (
          <div style={{ fontSize: 10.5, marginTop: 2, color: item.insight.tone === 'watch' ? WATCH : item.insight.tone === 'up' ? UP : DOWN }}>
            {item.insight.tone === 'watch' ? '◆ ' : ''}{item.insight.text}
          </div>
        )}
        {open && (
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>
            {item.summary && <div style={{ marginBottom: 3 }}>{item.summary}</div>}
            {item.reaction && item.reaction.ret !== null && (
              <div>
                Phản ứng giá ({item.reaction.from} → {item.reaction.to}, {item.reaction.sessions} phiên): {item.tickers[0]} {pct(item.reaction.ret)}
                {item.reaction.excess !== null && <> · so VN-Index {pct(item.reaction.excess)}</>}
                {item.reaction.volumeRatio !== null && <> · KL phiên sau tin ×{item.reaction.volumeRatio.toFixed(1)} TB20</>}
              </div>
            )}
            {item.sentimentHits.length > 0 && <div>Từ khoá cảm xúc: {item.sentimentHits.join(', ')}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
              {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--gold)' }}>Mở bài gốc ↗</a>}
              {item.attachment && item.attachment !== item.url && <a href={item.attachment} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--gold)' }}>Tài liệu đính kèm ↗</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewsFeed() {
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const selectTicker = useAppStore((s) => s.selectTicker);
  const radar = useRadarModel();
  const tickers = useMemo(() => [...new Set([...radar.tickers, ...(selectedTicker ? [selectedTicker] : [])])], [radar.tickers, selectedTicker]);
  const { data, error, isLoading, enabled } = useSmartNews(tickers);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);

  const coreSet = useMemo(() => new Set(radar.core.map((n) => n.ticker)), [radar.core]);
  const ringSet = useMemo(() => new Set(radar.ring.map((n) => n.ticker)), [radar.ring]);
  const listSet = useMemo(() => new Set(radar.tickers), [radar.tickers]);
  const relevance = (t: string) => (coreSet.has(t) ? 'Core' : ringSet.has(t) ? 'Ring' : listSet.has(t) ? 'Danh mục' : t === selectedTicker ? 'Đang chọn' : null);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    const f = all.filter((i) =>
      filter === 'disclosure' ? i.source === 'DISCLOSURE'
        : filter === 'pos' ? i.sentiment >= 0.25
          : filter === 'neg' ? i.sentiment <= -0.25
            : filter === 'selected' ? Boolean(selectedTicker && i.tickers.includes(selectedTicker))
              : true);
    // Ưu tiên Core > Ring > danh mục khi cùng mức quan trọng.
    const rank = (i: SmartNewsItem) => (i.tickers.some((t) => coreSet.has(t)) ? 2 : i.tickers.some((t) => ringSet.has(t)) ? 1 : 0);
    return [...f].sort((a, b) => b.importance + rank(b) * 5 - (a.importance + rank(a) * 5));
  }, [data, filter, selectedTicker, coreSet, ringSet]);

  // "Nhiệt tin": mã có nhiều tin nhất kèm cảm xúc trung bình.
  const heat = useMemo(() => Object.entries(data?.perTicker ?? {}).sort((a, b) => b[1].count - a[1].count).slice(0, 8), [data]);
  const failed = Object.values(data?.sources ?? {}).filter((s) => !s.ok).length;

  return (
    <div className="panel-block news-block">
      <div className="panel-head"><div className="panel-title">TIN TỨC THÔNG MINH <span className="ai-chip">AI</span></div></div>
      {!enabled && <div className="ac-hold">Cần Market Gateway để tải tin thật.</div>}
      {enabled && !tickers.length && <div className="ac-hold">Thêm mã vào ★ {radar.listName} để nhận tin liên quan.</div>}
      {enabled && tickers.length > 0 && (
        <>
          {heat.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '2px 0 6px' }} aria-label="Số tin và cảm xúc trung bình theo mã">
              {heat.map(([t, h]) => {
                const s = sentGlyph(h.avgSentiment);
                return (
                  <button key={t} type="button" onClick={() => { selectTicker(t); setFilter('selected'); setLimit(PAGE); }}
                    title={`${h.count} tin · cảm xúc TB ${h.avgSentiment.toFixed(2)} — bấm để lọc`}
                    style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-surface-2)', border: `1px solid ${s.c}55`, color: 'var(--text-secondary)' }}>
                    {t} <span style={{ color: s.c }}>{s.g}{h.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div role="tablist" aria-label="Lọc tin" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} type="button" onClick={() => { setFilter(f.id); setLimit(PAGE); }}
                style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)',
                  background: filter === f.id ? 'rgba(232,184,75,0.15)' : 'transparent', color: filter === f.id ? 'var(--gold)' : 'var(--text-secondary)' }}>
                {f.label}
              </button>
            ))}
          </div>
          {isLoading && !data && <div className="ac-hold">Đang tổng hợp tin từ HOSE/HNX, VNDirect, Vietstock, CafeF…</div>}
          {error && !data && <div className="ac-hold">Không tải được tin: {String((error as Error).message ?? error)}</div>}
          {data && items.length === 0 && <div className="ac-hold">Không có tin phù hợp trong {data.days} ngày qua.</div>}
          {items.slice(0, limit).map((item) => <NewsRow key={item.id} item={item} relevance={relevance} onTicker={selectTicker} />)}
          {items.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} style={{ fontSize: 10.5, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              Xem thêm {Math.min(PAGE, items.length - limit)} tin ▾
            </button>
          )}
          {data && (
            <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Nguồn: công bố HOSE/HNX/UPCOM, VNDirect, Vietstock, CafeF · {data.days} ngày · {data.items.length} tin sau khi gộp trùng
              {failed ? ` · ${failed} nguồn tạm lỗi` : ''} · cảm xúc theo từ điển tài chính, không phải khuyến nghị.
            </div>
          )}
        </>
      )}
    </div>
  );
}
