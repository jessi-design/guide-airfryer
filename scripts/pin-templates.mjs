// Gabarits HTML (rendus ensuite en PNG par generate-pin.mjs via Playwright)
// pour les épingles Pinterest. 3 mises en page x 2 teintes = 6 combinaisons,
// choisies en rotation pour ne jamais publier deux fois le même visuel de suite.

export const COLORWAY_NAMES = ['lime', 'coral'];

const COLORWAYS = {
  lime: {
    bg: '#b7d46a',
    card: '#ffffff',
    titleColor: '#2d3d1f',
    subColor: '#2d3d1f',
    bannerBg: '#2d3d1f',
    bannerText: '#ffffff',
    accent: '#ff8a3d',
  },
  coral: {
    bg: '#e8703a',
    card: '#fff6ea',
    titleColor: '#ffffff',
    subColor: '#fff6ea',
    bannerBg: '#ffffff',
    bannerText: '#e8703a',
    accent: '#ffffff',
  },
};

function baseStyles(fontBase64) {
  return `
    @font-face {
      font-family: 'PinScript';
      src: url(data:font/ttf;base64,${fontBase64}) format('truetype');
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1000px;
      height: 1500px;
      position: relative;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }
    .script { font-family: 'PinScript', cursive; }
  `;
}

function sparkleCross(color, x, y, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 46 46" style="position:absolute; top:${y}px; left:${x}px;">
    <line x1="23" y1="2" x2="23" y2="30" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <line x1="9" y1="16" x2="37" y2="16" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

function sparkleStar(color, x, y, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="position:absolute; top:${y}px; left:${x}px;">
    <path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" fill="${color}"/>
  </svg>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function layoutCard({ c, badge, title, subtitle, siteUrl, photoUrl }) {
  return `
    <body style="background:${c.bg};">
      ${sparkleCross(c.accent === '#ffffff' ? '#ffffff' : '#ffffff', 850, 50, 120)}
      ${sparkleStar(c.accent, 50, 160, 90)}
      <div style="position:absolute; top:70px; left:60px; background:${c.card}; border-radius:14px; padding:10px 20px; font-size:26px; font-weight:800; color:${c.titleColor}; text-transform:uppercase; letter-spacing:0.04em;">
        ${escapeHtml(badge)}
      </div>
      <div style="position:absolute; top:230px; left:70px; right:70px; height:830px; background:${c.card}; border-radius:36px; padding:26px; box-shadow:0 20px 50px rgba(0,0,0,0.22); transform:rotate(-1.2deg);">
        <img src="${photoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:22px; display:block;" />
      </div>
      <div style="position:absolute; left:60px; right:60px; top:1090px; text-align:center;">
        <div class="script" style="font-size:104px; line-height:1; color:${c.titleColor};">${escapeHtml(title)}</div>
        <div style="font-size:38px; font-weight:700; color:${c.subColor}; margin-top:18px;">${escapeHtml(subtitle)}</div>
      </div>
      <div style="position:absolute; left:70px; right:70px; bottom:60px; background:${c.bannerBg}; border-radius:20px; padding:26px 0; text-align:center; font-size:34px; color:${c.bannerText}; font-weight:700;">
        ${escapeHtml(siteUrl)}
      </div>
    </body>`;
}

function layoutLabel({ c, badge, title, subtitle, siteUrl, photoUrl }) {
  return `
    <body>
      <img src="${photoUrl}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" />
      <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%);"></div>
      <div style="position:absolute; top:70px; left:60px; background:${c.card}; border-radius:14px; padding:10px 20px; font-size:26px; font-weight:800; color:${c.bg === '#e8703a' ? c.bannerText : c.titleColor}; text-transform:uppercase; letter-spacing:0.04em;">
        ${escapeHtml(badge)}
      </div>
      ${sparkleStar('#ffffff', 860, 250, 70)}
      <div style="position:absolute; top:210px; left:80px; right:80px; background:${c.bg}; border-radius:34px; padding:60px 46px; text-align:center; transform:rotate(-1deg); box-shadow:0 20px 40px rgba(0,0,0,0.28);">
        <div class="script" style="font-size:96px; line-height:1; color:${c.titleColor};">${escapeHtml(title)}</div>
        <div style="font-size:34px; color:${c.subColor}; font-weight:700; margin-top:18px;">${escapeHtml(subtitle)}</div>
      </div>
      <div style="position:absolute; left:70px; right:70px; bottom:60px; background:#ffffff; border-radius:20px; padding:26px 0; text-align:center; font-size:34px; color:${c.bg}; font-weight:800;">
        ${escapeHtml(siteUrl)}
      </div>
    </body>`;
}

function layoutPhotoDominant({ c, badge, title, subtitle, siteUrl, photoUrl }) {
  return `
    <body>
      <img src="${photoUrl}" style="position:absolute; top:0; left:0; right:0; height:1112px; width:100%; object-fit:cover;" />
      <div style="position:absolute; top:60px; left:60px; background:${c.bg}; border-radius:999px; padding:20px 40px; font-size:28px; font-weight:800; color:${c.titleColor}; text-transform:uppercase; letter-spacing:0.03em;">
        ${escapeHtml(badge)}
      </div>
      ${sparkleStar('#ffffff', 880, 50, 70)}
      ${sparkleStar(c.accent, 800, 150, 44)}
      <div style="position:absolute; top:1112px; left:0; right:0; bottom:0; background:${c.bg}; padding:56px 60px; text-align:center;">
        <div class="script" style="font-size:88px; line-height:1; color:${c.titleColor}; position:relative; display:inline-block;">
          ${escapeHtml(title)}
          <svg width="440" height="34" viewBox="0 0 140 14" style="position:absolute; left:50%; transform:translateX(-50%); bottom:-26px;">
            <path d="M2 8 Q 20 -2, 40 7 T 80 7 T 120 7 T 138 6" stroke="${c.subColor}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          </svg>
        </div>
        <div style="font-size:32px; color:${c.subColor}; font-weight:700; margin-top:46px;">${escapeHtml(subtitle)}</div>
        <div style="font-size:28px; color:${c.subColor}; font-weight:600; margin-top:14px;">${escapeHtml(siteUrl)}</div>
      </div>
    </body>`;
}

const LAYOUTS = [layoutCard, layoutLabel, layoutPhotoDominant];

export function buildPinHtml({ layout, colorway, badge, title, subtitle, siteUrl, photoUrl, fontBase64 }) {
  const c = COLORWAYS[colorway] || COLORWAYS.lime;
  const layoutFn = LAYOUTS[layout % LAYOUTS.length];
  const bodyHtml = layoutFn({ c, badge, title, subtitle, siteUrl, photoUrl });
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles(fontBase64)}</style></head>${bodyHtml}</html>`;
}
