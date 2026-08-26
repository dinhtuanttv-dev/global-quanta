const TABS = ['Siêu quét AI', 'Kết nối thế giới', 'Lọc ngành', 'TA VN-Index', 'Chất xúc tác', 'Cổ tức', 'Elite 10'];

export default function MainTabsPlaceholder() {
  return (
    <div className="main">
      <div className="main-tabs">
        {TABS.map((tab, i) => (
          <div key={tab} className={`m-tab ${i === 0 ? 'active' : ''}`}>{tab}</div>
        ))}
      </div>
      <div className="main-placeholder">
        <b>Nội dung Tab — ngoài phạm vi component hoá lần này</b>
        Cột giữa giữ nguyên cấu trúc 7-tab, mỗi tab là 1 module route riêng, lazy-load độc lập.
        Xem Mục 5.4 trong Dev Handoff Spec để triển khai chi tiết từng tab.
      </div>
    </div>
  );
}
