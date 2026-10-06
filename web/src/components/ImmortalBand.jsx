const ICONS = 'https://base44.app/api/apps/6a94977def75997d3f73bc5e/files/mp/public/6a94977def75997d3f73bc5e';

const IMMORTALS = [
  { name: 'Tiên Sở Kỳ Thiên', tag: '8Sky+', icon: `${ICONS}/d61f7969f_icon1_sokythien_gold.png` },
  { name: 'Tiên Sở Thiên', tag: '9Sky+', icon: `${ICONS}/30292a571_icon2_sothien_gold.png` },
  { name: 'Tiên Bản Hoá Sở Thiên', tag: '9th', icon: `${ICONS}/160bfa0c0_icon3_banhoa_gold.png` },
  { name: 'Tiên Thảo Hoá Sở Thiên', tag: '9nm', icon: `${ICONS}/f294673be_icon4_thaohoa_gold.png` },
  { name: 'Tiên Cá Sở Thiên', tag: '(9th)*', icon: `${ICONS}/afe89e641_icon5_casothien_gold.png` },
  { name: 'Tiên Cá Sở Thuỷ Thiên', tag: '(9ss)*', icon: `${ICONS}/bd1546afa_icon6_sothuythien_gold.png` },
];

export default function ImmortalBand() {
  return (
    <section className="band" aria-label="Lục Ngộ Sở Thiên">
      <div className="band__head">
        <span className="band__crown" aria-hidden="true">
          ♛
        </span>
        <h2 className="band__title">Lục Ngộ Sở Thiên</h2>
        <span className="band__crown" aria-hidden="true">
          ♛
        </span>
      </div>
      <p className="band__sub">Chúng Tiên Sở Thuỷ Thiên · Hoàng Ân</p>

      <ul className="band__grid">
        {IMMORTALS.map((item) => (
          <li key={item.name} className="seal" style={{ '--ci': IMMORTALS.indexOf(item) }}>
            <span className="seal__halo" aria-hidden="true" />
            <span className="seal__ring">
              <img src={item.icon} alt="" loading="lazy" />
            </span>
            <span className="seal__name">{item.name}</span>
            <span className="seal__tag">{item.tag}</span>
          </li>
        ))}
      </ul>

      <blockquote className="band__lore">
        “<em>Sở Thiên</em> giữ phần bay lên; <em>Sở Thuỷ</em> giữ phần chưa bao giờ khô.”
      </blockquote>
    </section>
  );
}
