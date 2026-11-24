// Fixed FPT data and SVG geometry from the approved screenshot. Only the local reference entry imports this file.
import type { RoomReference } from "./roomView";

export const roomReference: RoomReference = {
  ticker: (
    <section className={"ticker-bar"} aria-label={"Snapshot đang phân tích"}>
      <div className={"ticker-head"}>
        <div>
          <div className={"ticker-symbol"}>{"FPT "}<span className={"mini-badge"}>{"MÃ ĐÃ XÁC THỰC"}</span></div>
          <div className={"ticker-name"}>{"FPT Corporation · Công nghệ thông tin · HOSE"}</div>
        </div>
        <div className={"ticker-price"}>
          <strong>{"132.500"}</strong>
          <small>{"+1,15% · dữ liệu ví dụ"}</small>
        </div>
      </div>
      <div className={"snapshot-meta"}>
        <span className={"meta-chip good"}>{"● Snapshot EB-7F31"}</span>
        <span className={"meta-chip"}>{"Decision 20/11"}</span>
        <span className={"meta-chip good"}>{"3 nguồn hiện tại"}</span>
        <span className={"meta-chip warn"}>{"1 nguồn cần lưu ý"}</span>
        <button className={"primary-btn"}>{"✦ Kiểm chứng & tranh luận"}</button>
      </div>
    </section>
  ),
  left: (
    <aside className={"panel panel-pad"} aria-label={"Trạng thái phễu và dữ liệu"}>
      <div className={"section-head"}>
        <div>
          <div className={"eyebrow"}>{"Context rail"}</div>
          <h2 style={{"marginTop": "4px"}}>{"Phễu Elite HL"}</h2>
        </div>
        <button className={"small-link"} data-source={"decision.funnel.selectedTradable"}>{"Mở nguồn"}</button>
      </div>
      <div className={"funnel"}>
        <div className={"funnel-step"}>
          <span className={"num"}>{"1"}</span>
          <div>
            <div className={"funnel-name"}>{"Bảng tín hiệu"}</div>
            <div className={"funnel-rule"}>{"Universe của phiên"}</div>
          </div>
          <span className={"funnel-count"}>{"412"}</span>
        </div>
        <div className={"parallel"}>
          <div className={"funnel-step"}>
            <span className={"num"}>{"2"}</span>
            <div>
              <div className={"funnel-name"}>{"Giao dịch được"}</div>
              <div className={"funnel-rule"}>{"GTGD TB20 · giá"}</div>
            </div>
            <span className={"funnel-count"}>{"268"}</span>
          </div>
          <div className={"funnel-step"}>
            <span className={"num"}>{"3"}</span>
            <div>
              <div className={"funnel-name"}>{"Đạt tầng 1"}</div>
              <div className={"funnel-rule"}>{"LS-v1 · mô hình TA"}</div>
            </div>
            <span className={"funnel-count"}>{"91"}</span>
          </div>
          <div className={"parallel-note"}>{"Bước 2 và 3 được tính song song"}</div>
        </div>
        <div className={"funnel-step"}>
          <span className={"num"}>{"4"}</span>
          <div>
            <div className={"funnel-name"}>{"Hợp lưu"}</div>
            <div className={"funnel-rule"}>{"Tầng 1 + RRG ngành"}</div>
          </div>
          <span className={"funnel-count"}>{"37"}</span>
        </div>
        <div className={"funnel-step active"}>
          <span className={"num"}>{"5"}</span>
          <div>
            <div className={"funnel-name"}>{"Hợp lưu giao dịch được"}</div>
            <div className={"funnel-rule"}>{"Thanh khoản đạt"}</div>
          </div>
          <span className={"funnel-count"}>{"29"}</span>
        </div>
        <div className={"funnel-step"}>
          <span className={"num"}>{"6"}</span>
          <div>
            <div className={"funnel-name"}>{"Vùng mua PZ"}</div>
            <div className={"funnel-rule"}>{"PZ · chỉ hiển thị"}</div>
          </div>
          <span className={"funnel-count"}>{"DISPLAY"}</span>
        </div>
        <div className={"funnel-step"}>
          <span className={"num"}>{"7"}</span>
          <div>
            <div className={"funnel-name"}>{"Danh mục"}</div>
            <div className={"funnel-rule"}>{"Giữ lại + mua mới"}</div>
          </div>
          <span className={"funnel-count"}>{"10"}</span>
        </div>
      </div>
      <div style={{"height": "12px"}} />
      <div className={"section-head"}>
        <h3>{"Snapshot health"}</h3>
        <span className={"mini-badge"}>{"ỔN ĐỊNH"}</span>
      </div>
      <div className={"status-row"}>
        <span>{"Decision / rule version"}</span>
        <strong>{"20/11 · HL-4.2"}</strong>
      </div>
      <div className={"status-row"}>
        <span>{"Hồ sơ / PA"}</span>
        <strong className={"good-text"}>{"20/11 · bar đóng"}</strong>
      </div>
      <div className={"status-row"}>
        <span>{"Tin / catalyst"}</span>
        <strong className={"warn-text"}>{"1 nguồn đối chiếu"}</strong>
      </div>
      <div className={"status-row"}>
        <span>{"Ledger"}</span>
        <strong>{"THĂM DÒ · n=84"}</strong>
      </div>
      <div className={"status-row"}>
        <span>{"Snapshot"}</span>
        <strong>{"Đã đóng băng"}</strong>
      </div>
    </aside>
  ),
  right: (
    <aside className={"right-panel"}>
      <section className={"panel panel-pad"}>
        <div className={"section-head"}>
          <div>
            <div className={"eyebrow"}>{"Decision timing"}</div>
            <h2 style={{"marginTop": "4px"}}>{"Các lớp xác nhận"}</h2>
          </div>
          <span className={"soft-label"}>{"theo snapshot"}</span>
        </div>
        <div className={"decision-card"}>
          <strong>{"CHƯA ĐỦ ĐỒNG THUẬN"}</strong>
          <p>{"Funnel và PA đạt trạng thái hiện tại. Khối lượng đang phân kỳ; nguồn xúc tác cần đối chiếu. Đây không phải tín hiệu đặt lệnh."}</p>
        </div>
        <div className={"signal-list"}>
          <div className={"signal-line"}>
            <span className={"signal-icon"}>{"✓"}</span>
            <div>
              <div className={"signal-name"}>{"Tư cách phễu"}</div>
              <div className={"signal-detail"}>{"Bước 5 · SELECTED_TRADABLE"}</div>
            </div>
            <span className={"signal-state"}>{"ĐẠT"}</span>
          </div>
          <div className={"signal-line"}>
            <span className={"signal-icon"}>{"✓"}</span>
            <div>
              <div className={"signal-name"}>{"Price Action"}</div>
              <div className={"signal-detail"}>{"Breakout · bar ngày đóng"}</div>
            </div>
            <span className={"signal-state"}>{"TRIGGERED"}</span>
          </div>
          <div className={"signal-line"}>
            <span className={"signal-icon wait"}>{"!"}</span>
            <div>
              <div className={"signal-name"}>{"Khối lượng"}</div>
              <div className={"signal-detail"}>{"RVOL 1,42× · OBV đi ngang"}</div>
            </div>
            <span className={"signal-state wait"}>{"PHÂN KỲ"}</span>
          </div>
          <div className={"signal-line"}>
            <span className={"signal-icon wait"}>{"!"}</span>
            <div>
              <div className={"signal-name"}>{"Xúc tác"}</div>
              <div className={"signal-detail"}>{"Nguồn chưa đối chiếu độc lập"}</div>
            </div>
            <span className={"signal-state wait"}>{"RÀ SOÁT"}</span>
          </div>
          <div className={"signal-line"}>
            <span className={"signal-icon neutral"}>{"•"}</span>
            <div>
              <div className={"signal-name"}>{"Cửa sổ mùa vụ"}</div>
              <div className={"signal-detail"}>{"Không có setup VALIDATED hiện tại"}</div>
            </div>
            <span className={"signal-state neutral"}>{"KHÔNG CÓ"}</span>
          </div>
          <div className={"signal-line"}>
            <span className={"signal-icon"}>{"✓"}</span>
            <div>
              <div className={"signal-name"}>{"Thanh khoản"}</div>
              <div className={"signal-detail"}>{"Theo rule phiên · engine"}</div>
            </div>
            <span className={"signal-state"}>{"ĐẠT"}</span>
          </div>
        </div>
        <div className={"blocker"}><b>{"Điều kiện cần kiểm tra tiếp"}</b><br />{"Đối chiếu nguồn hợp đồng; kiểm tra volume theo phiên đóng tiếp theo. Không nâng mức xác nhận khi một nguồn còn stale/chưa xác minh."}</div>
      </section>
      <section className={"panel panel-pad"}>
        <div className={"section-head"}>
          <h3>{"Tin & xúc tác liên quan"}</h3>
          <button className={"small-link"} data-source={"catalyst.event.4481"}>{"Chi tiết nguồn"}</button>
        </div>
        <div className={"catalyst-card"}>
          <div className={"inline"} style={{"justifyContent": "space-between"}}>
            <h4>{"Hợp đồng hạ tầng số"}</h4>
            <span className={"mini-badge warn"}>{"CẦN ĐỐI CHIẾU"}</span>
          </div>
          <p>{"Event Radar · gắn mã FPT với độ tin cậy 0,82. Chưa coi là nguồn xác nhận độc lập; nội dung và tác động chỉ minh họa."}</p>
          <div className={"source-meta"}>
            <span>{"Phát hiện 09:42 · nguồn A"}</span>
            <span>{"1 nguồn đối chứng"}</span>
          </div>
        </div>
        <div className={"footer-note"}>{"Cửa sổ mùa vụ nếu có phải kèm số sự kiện, kỳ đo, kỳ vọng ròng và q; không thay cho trigger giá hôm nay."}</div>
      </section>
    </aside>
  ),
  world: (
    <div className={"canvas-world"}>
      <svg className={"edges"} viewBox={"0 0 920 430"} aria-hidden={"true"}>
        <defs>
          <marker id={"arrowGreen"} markerWidth={"7"} markerHeight={"7"} refX={"6"} refY={"3.5"} orient={"auto"}>
            <path d={"M0 0 L7 3.5 L0 7"} fill={"none"} stroke={"#47d6a0"} />
          </marker>
          <marker id={"arrowRed"} markerWidth={"7"} markerHeight={"7"} refX={"6"} refY={"3.5"} orient={"auto"}>
            <path d={"M0 0 L7 3.5 L0 7"} fill={"none"} stroke={"#ff7189"} />
          </marker>
        </defs>
        <path className={"edge support"} markerEnd={"url(#arrowGreen)"} d={"M275 215 C315 215 315 100 348 100"} />
        <path className={"edge risk"} markerEnd={"url(#arrowRed)"} d={"M275 215 C315 215 315 300 348 300"} />
        <path className={"edge support"} d={"M497 99 C540 99 530 83 568 83"} />
        <path className={"edge context"} d={"M497 99 C535 99 535 177 568 177"} />
        <path className={"edge risk"} d={"M497 299 C535 299 535 273 568 273"} />
        <path className={"edge support"} d={"M497 299 C540 299 540 360 568 360"} />
        <path className={"edge ai"} markerEnd={"url(#arrowGreen)"} d={"M718 83 C760 83 745 210 765 210"} />
        <path className={"edge ai"} markerEnd={"url(#arrowRed)"} d={"M718 273 C760 273 745 225 765 225"} />
        <path className={"edge ai"} d={"M718 177 C748 177 746 210 765 210"} />
      </svg>
      <div className={"node root"} style={{"left": "137px", "top": "184px"}} tabIndex={0} role={"button"} data-source={"snapshot.FPT"}>
        <div className={"node-label"}>
          <span>{"Snapshot"}</span>
          <span className={"mini-badge"}>{"LOCKED"}</span>
        </div>
        <div className={"node-title"}>{"FPT · 20/11/2026"}</div>
        <div className={"node-meta"}>{"EB-7F31 · 4 nguồn · HL-4.2"}</div>
      </div>
      <div className={"node bull"} style={{"left": "348px", "top": "66px"}} tabIndex={0} role={"button"} data-source={"claim.bull"}>
        <div className={"node-label"}>
          <span>{"Claude · phe thuận"}</span>
          <span className={"mini-badge"}>{"2 REFS"}</span>
        </div>
        <div className={"node-title"}>{"Tăng trưởng vẫn dẫn dắt"}</div>
        <div className={"node-meta"}>{"Luận điểm AI · chưa phải dữ kiện đã kiểm chứng"}</div>
      </div>
      <div className={"node bear"} style={{"left": "348px", "top": "270px"}} tabIndex={0} role={"button"} data-source={"claim.bear"}>
        <div className={"node-label"}>
          <span>{"Gemini · phản biện"}</span>
          <span className={"mini-badge red"}>{"1 RỦI RO"}</span>
        </div>
        <div className={"node-title"}>{"Giá kích hoạt nhưng cung tăng"}</div>
        <div className={"node-meta"}>{"Luận điểm AI · kiểm tra volume"}</div>
      </div>
      <div className={"node evidence"} style={{"left": "568px", "top": "49px"}} tabIndex={0} role={"button"} data-source={"decision.funnel.selectedTradable"}>
        <div className={"node-label"}>
          <span>{"Funnel · engine"}</span>
          <span className={"mini-badge"}>{"VERIFIED"}</span>
        </div>
        <div className={"node-title"}>{"Đạt bước 5 / 7"}</div>
        <div className={"node-meta"}>{"Đủ hợp lưu & giao dịch"}</div>
        <span className={"node-ref"}>{"decision.funnel.selectedTradable"}</span>
      </div>
      <div className={"node catalyst"} style={{"left": "568px", "top": "145px"}} tabIndex={0} role={"button"} data-source={"catalyst.event.4481"}>
        <div className={"node-label"}>
          <span>{"Event Radar"}</span>
          <span className={"mini-badge warn"}>{"REVIEW"}</span>
        </div>
        <div className={"node-title"}>{"Hợp đồng mới · nguồn cần đối chiếu"}</div>
        <div className={"node-meta"}>{"Phát hiện 09:42 · match 0,82"}</div>
        <span className={"node-ref"}>{"catalyst.event.4481"}</span>
      </div>
      <div className={"node evidence"} style={{"left": "568px", "top": "241px"}} tabIndex={0} role={"button"} data-source={"pa.setup.latest"}>
        <div className={"node-label"}>
          <span>{"Price Action"}</span>
          <span className={"mini-badge"}>{"TRIGGERED"}</span>
        </div>
        <div className={"node-title"}>{"Breakout · bar ngày đã đóng"}</div>
        <div className={"node-meta"}>{"Trigger 132.000 · vô hiệu 127.500"}</div>
        <span className={"node-ref"}>{"pa.setup.latest"}</span>
      </div>
      <div className={"node evidence"} style={{"left": "568px", "top": "305px"}} tabIndex={0} role={"button"} data-source={"volume.rvol20"}>
        <div className={"node-label"}>
          <span>{"Volume · daily"}</span>
          <span className={"mini-badge warn"}>{"DIVERGING"}</span>
        </div>
        <div className={"node-title"}>{"RVOL 1,42× · OBV đi ngang"}</div>
        <div className={"node-meta"}>{"Cùng phiên · dữ liệu minh họa"}</div>
        <span className={"node-ref"}>{"volume.rvol20"}</span>
      </div>
      <div className={"node judge"} style={{"left": "722px", "top": "183px"}} tabIndex={0} role={"button"} data-source={"judge.review"}>
        <div className={"node-label"}>
          <span>{"Claude · trọng tài"}</span>
          <span className={"mini-badge warn"}>{"PARTIAL"}</span>
        </div>
        <div className={"node-title"}>{"Kỹ thuật đã kích hoạt; volume và nguồn tin chưa đồng thuận."}</div>
        <div className={"node-meta"}>{"2 claim được hỗ trợ · 1 claim cần xác minh"}</div>
      </div>
    </div>
  ),
  chart: (
    <div className={"chart-wrap"}>
      <svg viewBox={"0 0 920 190"} role={"img"} aria-label={"Biểu đồ minh họa giá, khối lượng và ngày sự kiện"}>
        <line className={"gridline"} x1={"44"} y1={"25"} x2={"890"} y2={"25"} />
        <line className={"gridline"} x1={"44"} y1={"65"} x2={"890"} y2={"65"} />
        <line className={"gridline"} x1={"44"} y1={"105"} x2={"890"} y2={"105"} />
        <line className={"chart-axis"} x1={"44"} y1={"137"} x2={"890"} y2={"137"} />
        <line className={"chart-axis"} x1={"44"} y1={"18"} x2={"44"} y2={"137"} />
        <line className={"event-line"} x1={"565"} y1={"20"} x2={"565"} y2={"137"} />
        <line className={"trigger-line"} x1={"733"} y1={"20"} x2={"733"} y2={"137"} />
        <line className={"invalidation-line"} x1={"44"} y1={"115"} x2={"890"} y2={"115"} />
        <rect className={"volume-bar"} x={"60"} y={"120"} width={"11"} height={"17"} />
        <rect className={"volume-bar"} x={"92"} y={"114"} width={"11"} height={"23"} />
        <rect className={"volume-bar"} x={"124"} y={"122"} width={"11"} height={"15"} />
        <rect className={"volume-bar"} x={"156"} y={"107"} width={"11"} height={"30"} />
        <rect className={"volume-bar"} x={"188"} y={"116"} width={"11"} height={"21"} />
        <rect className={"volume-bar"} x={"220"} y={"108"} width={"11"} height={"29"} />
        <rect className={"volume-bar"} x={"252"} y={"111"} width={"11"} height={"26"} />
        <rect className={"volume-bar"} x={"284"} y={"99"} width={"11"} height={"38"} />
        <rect className={"volume-bar"} x={"316"} y={"117"} width={"11"} height={"20"} />
        <rect className={"volume-bar"} x={"348"} y={"104"} width={"11"} height={"33"} />
        <rect className={"volume-bar"} x={"380"} y={"112"} width={"11"} height={"25"} />
        <rect className={"volume-bar"} x={"412"} y={"96"} width={"11"} height={"41"} />
        <rect className={"volume-bar"} x={"444"} y={"100"} width={"11"} height={"37"} />
        <rect className={"volume-bar"} x={"476"} y={"108"} width={"11"} height={"29"} />
        <rect className={"volume-bar"} x={"508"} y={"89"} width={"11"} height={"48"} />
        <rect className={"volume-bar"} x={"540"} y={"73"} width={"11"} height={"64"} style={{"fill": "#c18443"}} />
        <rect className={"volume-bar"} x={"572"} y={"97"} width={"11"} height={"40"} />
        <rect className={"volume-bar"} x={"604"} y={"104"} width={"11"} height={"33"} />
        <rect className={"volume-bar"} x={"636"} y={"91"} width={"11"} height={"46"} />
        <rect className={"volume-bar"} x={"668"} y={"83"} width={"11"} height={"54"} />
        <rect className={"volume-bar"} x={"700"} y={"74"} width={"11"} height={"63"} />
        <rect className={"volume-bar"} x={"732"} y={"64"} width={"11"} height={"73"} style={{"fill": "#48c99d"}} />
        <rect className={"volume-bar"} x={"764"} y={"88"} width={"11"} height={"49"} />
        <rect className={"volume-bar"} x={"796"} y={"93"} width={"11"} height={"44"} />
        <rect className={"volume-bar"} x={"828"} y={"100"} width={"11"} height={"37"} />
        <rect className={"volume-bar"} x={"860"} y={"105"} width={"11"} height={"32"} />
        <path className={"price-line"} d={"M48 91 L82 88 L116 94 L150 83 L184 86 L218 78 L252 83 L286 70 L320 75 L354 67 L388 74 L422 58 L456 62 L490 50 L524 54 L558 42 L592 51 L626 46 L660 54 L694 38 L728 32 L762 43 L796 36 L830 39 L864 28 L890 32"} />
        <circle cx={"565"} cy={"40"} r={"4"} fill={"#f3a95f"} />
        <circle cx={"733"} cy={"32"} r={"4"} fill={"#47d6a0"} />
        <text className={"chart-tag"} x={"572"} y={"29"}>{"Tin · cần đối chiếu"}</text>
        <text className={"chart-tag"} x={"740"} y={"23"} style={{"fill": "#66ddb0"}}>{"PA trigger"}</text>
        <text className={"chart-label"} x={"49"} y={"157"}>{"01/10"}</text>
        <text className={"chart-label"} x={"445"} y={"157"}>{"25/10"}</text>
        <text className={"chart-label"} x={"834"} y={"157"}>{"20/11"}</text>
        <text className={"chart-label"} x={"50"} y={"177"}>{"Khối lượng ngày · cột"}</text>
        <text className={"chart-label"} x={"752"} y={"112"} style={{"fill": "#ff9aaa"}}>{"Mức vô hiệu 127.500"}</text>
      </svg>
    </div>
  ),
  chartNotes: (
    <div className={"chart-notes"}>
      <span className={"tiny-chip gold"}>{"◇ Event 4481 · first-seen 09:42"}</span>
      <span className={"tiny-chip green"}>{"▲ Trigger 132.000 · bar đã đóng"}</span>
      <span className={"tiny-chip red"}>{"— Invalidation 127.500"}</span>
      <span className={"tiny-chip"}>{"RVOL intraday: chưa dùng · daily snapshot"}</span>
    </div>
  ),
  footer: (
    <p className={"footer-note"}>{"Prototype tĩnh để duyệt hướng giao diện. Mọi ticker, giá, count funnel, event, volume, trạng thái và thời điểm trong hình đều là dữ liệu mô phỏng; không phải dữ liệu thị trường hay khuyến nghị đầu tư."}</p>
  ),
};
