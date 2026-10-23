// TOPBAR (docs/TOPBAR_UPGRADE_SPEC.md, T1–T4): thanh trạng thái đáng tin cậy — MỘT snapshot Gateway /api/market/topbar,
// mỗi khối có nguồn / thời điểm / trạng thái riêng; không giá mô phỏng, không số 0 giả, không chuông giả, avatar mở menu.
// Responsive (không ẩn mất tính năng): ≤ 1600px độ rộng + thanh khoản + phiên, ≤ 1100px vĩ mô chuyển vào "Thị trường ▾";
// ≤ 980px gọn logo / chế độ thị trường (có trong panel); ≤ 768px lưới 2 hàng (logo · VN-Index · nguồn · tài khoản / Thị trường · tìm mã) + bottom sheet.
import RegimeBadge from './RegimeBadge';
import VnIndexHero from './VnIndexHero';
import MacroTickerItem from './MacroTickerItem';
import MacroStrip from './MacroStrip';
import MarketBreadth from './MarketBreadth';
import LiquidityCheckBadge, { LiquidityDetail } from './LiquidityCheckBadge';
import SessionClock from './SessionClock';
import { AccountMenu } from './TopRightControls';
import { TickerSearch, FeedStatusBadge } from './TickerSearch';
import InfraHealthBadge from './InfraHealthBadge';
import Popover, { PopTrigger, usePopover } from './Popover';
import { placeholderMeta, useTopbar, type Block, type TopbarSnapshot } from '../../hooks/useTopbar';
import './topbar-pro.css';

const MACRO_LABELS = ['DXY', 'US 10Y', 'GOLD'];
export const BRAND = { name: 'ĐINH TUẤN', mark: 'ĐT' };

function blocks(data: TopbarSnapshot | undefined, ph: Block<never>) {
  return {
    index: data?.index ?? ph, breadth: data?.breadth ?? ph, sessions: data?.sessions ?? ph, liquidity: data?.liquidity ?? ph, regime: data?.regime ?? ph,
    macro: data?.macro ?? MACRO_LABELS.map(() => ph),
  };
}

/** Nút "Thị trường ▾" (≤ 1280px): độ rộng, thanh khoản, phiên, vĩ mô trong một panel / bottom sheet có tiêu đề. */
function MarketDetails({ b }: { b: ReturnType<typeof blocks> }) {
  const pop = usePopover();
  const warn = [b.index, b.breadth, b.liquidity, ...b.macro].some((x) => x.meta.status === 'error' || x.meta.status === 'stale');
  return (
    <div className="tb-more">
      <PopTrigger pop={pop} label="Chi tiết thị trường: độ rộng, thanh khoản, phiên, vĩ mô" className="tb-more-btn">
        Thị trường <span aria-hidden>▾</span>{warn && <span className="tb-more-dot" aria-label="Có nguồn dữ liệu lỗi hoặc cũ" />}
      </PopTrigger>
      <Popover pop={pop} title="Thị trường" width={360}>
        <div className="tb-details" data-testid="tb-details">
          <section className="tb-details-regime"><h4>Chế độ thị trường</h4><RegimeBadge block={b.regime} /></section>
          <section><h4>Độ rộng</h4><MarketBreadth block={b.breadth} detailed /></section>
          <section><h4>Phiên giao dịch</h4><SessionClock block={b.sessions} detailed /></section>
          <section><h4>Vĩ mô</h4><div className="tb-macro-list">{b.macro.map((m, i) => <MacroTickerItem key={MACRO_LABELS[i]} block={m} fallbackLabel={MACRO_LABELS[i]} />)}</div></section>
          <section><h4>Thanh khoản lũy kế 10:30</h4><LiquidityDetail block={b.liquidity} /></section>
        </div>
      </Popover>
    </div>
  );
}

export default function TopBar() {
  const { data, error, isLoading, enabled } = useTopbar();
  const ph: Block<never> = { data: null, meta: placeholderMeta({ isLoading, error, enabled }) };
  const b = blocks(data, ph);

  return (
    <header className="topbar topbar-pro" data-testid="topbar">
      <div className="tb-zone tb-zone-left">
        <div className="logo" aria-label={BRAND.name}>
          <div className="mark" aria-hidden>{BRAND.mark}</div>
          <span className="logo-name">{BRAND.name}</span>
        </div>
        <span className="tb-regime"><RegimeBadge block={b.regime} /></span>
      </div>

      <div className="tb-zone tb-zone-center">
        <VnIndexHero block={b.index} />
        <MacroStrip blocks={b.macro} labels={MACRO_LABELS} />
      </div>

      <div className="tb-zone tb-zone-right">
        <span className="tb-wide tb-w-breadth"><MarketBreadth block={b.breadth} /></span>
        <span className="tb-wide tb-w-liq"><LiquidityCheckBadge block={b.liquidity} /></span>
        <span className="tb-wide tb-w-sess"><SessionClock block={b.sessions} /></span>
        <MarketDetails b={b} />
        <div className="top-right">
          <span className="tb-feed"><FeedStatusBadge /></span>
          <span className="tb-infra"><InfraHealthBadge /></span>
          <span className="tb-search"><TickerSearch /></span>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
