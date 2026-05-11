export function parseDur(s: string): number {
  if (!s || s === 'indefinite') return 0;
  s = s.trim().toLowerCase();
  if (s.endsWith('ms')) return parseFloat(s) / 1000;
  if (s.endsWith('min')) return parseFloat(s) * 60;
  if (s.endsWith('s')) return parseFloat(s);
  return parseFloat(s) || 0;
}

export function stampSVG(raw: string, t: number): string {
  let s = raw;
  const vbM = s.match(/viewBox=["']([^"']+)["']/i);
  let vw = 1920, vh = 1080;
  if (vbM) {
    const p = vbM[1].trim().split(/[\s,]+/).map(Number);
    if (p.length >= 4) { vw = p[2]; vh = p[3]; }
  }
  
  // Ensure dimensions
  s = s.replace(/(<svg\b[^>]*?)\s+width=["'][^"']*["']/gi, '$1')
       .replace(/(<svg\b[^>]*?)\s+height=["'][^"']*["']/gi, '$1')
       .replace(/<svg\b/i, `<svg width="${vw}" height="${vh}"`);

  // SMIL animations
  const smilTags = ['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set'];
  for (const tag of smilTags) {
    s = s.replace(new RegExp(`(<${tag}\\b)([^>]*?)(\\/?>)`, 'gi'), (m, open, attrs, close) => {
      const c = attrs.replace(/\s+begin=["'][^"']*["']/gi, '');
      const dM = attrs.match(/\bdur=["']([^"']+)["']/i);
      const d = dM ? parseDur(dM[1]) : 0;
      const loopT = d > 0 ? t % d : t;
      return `${open}${c} begin="-${loopT.toFixed(5)}s"${close}`;
    });
  }

  // CSS Animations
  let animDur = 0;
  const styleMatches = s.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  for (const style of styleMatches) {
    const animShorthands = style.match(/animation\s*:\s*[^;]+/gi) || [];
    for (const anim of animShorthands) {
      const durM = anim.match(/(\d+\.?\d*)\s*s/);
      if (durM) {
        const d = parseFloat(durM[1]);
        if (d > 0) animDur = d;
      }
    }
  }

  const loopedDelay = animDur > 0 ? t % animDur : t;
  const preciseCssFixStyle = `
<style>
/* VECTRA frame capture — time: ${t.toFixed(4)}s */
* { animation-play-state: paused !important; animation-delay: -${loopedDelay.toFixed(5)}s !important; }
</style>`;

  if (s.indexOf('</defs>') !== -1) {
    s = s.replace('</defs>', preciseCssFixStyle + '</defs>');
  } else if (s.indexOf('</style>') !== -1) {
    s = s.replace(/(<\/style>)(?=[^<]*<(?:rect|circle|text|g|path|use))/i, '$1' + preciseCssFixStyle);
  } else {
    s = s.replace(/(<svg\b[^>]*>)/i, '$1' + preciseCssFixStyle);
  }

  return s;
}

export function renderSVGFrame(ctx: CanvasRenderingContext2D, raw: string, t: number, W: number, H: number): Promise<void> {
  return new Promise((resolve) => {
    const stamped = stampSVG(raw, t);
    const blob = new Blob([stamped], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
        let dw = W, dh = H, dx = 0, dy = 0;
        if (W / H > ar) {
          dh = W / ar;
          dy = -(dh - H) / 2;
        } else {
          dw = H * ar;
          dx = -(dw - W) / 2;
        }
        ctx.drawImage(img, dx, dy, dw, dh);
      } catch (e) {
        console.error("Frame render error", e);
      }
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}
