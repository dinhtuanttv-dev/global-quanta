import EliteCommandRadar from './EliteCommandRadar';
import ActionCenter from './ActionCenter';
import NewsFeed from './NewsFeed';

/** Cột phải — cùng ngôn ngữ thiết kế với tab Siêu Quét AI (thẻ tối bo góc, tiêu đề cyan, điểm hổ phách, AI tím). */
export default function InsightPanel() {
  return (
    <div className="insight tw-scope">
      <div className="flex flex-col gap-3 p-3">
        <EliteCommandRadar />
        <ActionCenter />
        <NewsFeed />
        <p className="text-[9.5px] text-slate-500 px-1 pb-2">
          Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư. Dữ liệu cập nhật theo thời gian thực, có thể trễ.
        </p>
      </div>
    </div>
  );
}
