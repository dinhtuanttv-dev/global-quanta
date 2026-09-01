/**
 * LivePriceCell.tsx
 * Component hiển thị Live Price trong Tang1Table
 * Tách biệt hoàn toàn - KHÔNG ảnh hưởng đến logic hiện có
 */

import { memo } from 'react';
import type { LivePrice } from './livePriceApi';

interface Props {
  livePrice: LivePrice | null;
  /** Show change amount instead of percentage */
  showChangeAmount?: boolean;
}

function LivePriceCell({ livePrice, showChangeAmount = false }: Props) {
  // No data available
  if (!livePrice || livePrice.price === null) {
    return (
      <td className="t1-live-price">
        <span className="t1-price-loading">--</span>
      </td>
    );
  }

  const { price, change, changePct } = livePrice;
  const isPositive = (changePct ?? 0) >= 0;
  const isNegative = (changePct ?? 0) < 0;

  // Format price
  const formattedPrice = price !== null
    ? price.toLocaleString('vi-VN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : '--';

  // Format change
  const formattedChange = showChangeAmount && change !== null
    ? `${isPositive ? '+' : ''}${change.toFixed(0)}`
    : `${isPositive ? '+' : ''}${(changePct ?? 0).toFixed(1)}%`;

  return (
    <td className="t1-live-price">
      <div className="t1-price-group">
        <span className="t1-price-value">{formattedPrice}</span>
        <span className={`t1-price-change ${isPositive ? 'up' : ''} ${isNegative ? 'down' : ''}`}>
          {formattedChange}
        </span>
      </div>
    </td>
  );
}

export default memo(LivePriceCell);
