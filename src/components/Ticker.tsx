export function Ticker() {
  const items = [
    { text: "AURA ENGINE READY", dot: true },
    { text: "SVG → WEBM CONVERSION", dot: true },
    { text: "UNLIMITED EXPORTS ENABLED", dot: true },
    { text: "VP9 · VP8 · WEBM SUPPORT", dot: true },
    { text: "UP TO 1920×1080 · 60FPS", dot: true },
    { text: "CSS ANIMATIONS · SMIL · TRANSFORMS", dot: true },
  ];

  const duplicatedItems = [...items, ...items, ...items];

  return (
    <div className="ticker-wrap ticker-gradient-animate bg-gradient-to-r from-cyan-glow via-purple-glow to-pink-glow py-1.5 overflow-hidden h-8 relative z-[100]">
      <div className="ticker-inner flex whitespace-nowrap ticker-animate w-max">
        {duplicatedItems.map((item, i) => (
          <div key={i} className="flex items-center">
            <span className="ticker-item font-mono text-[9px] font-bold tracking-[3px] text-black px-9">
              {item.text}
            </span>
            {item.dot && <span className="ticker-dot opacity-50 px-1 text-black text-[8px]">◆</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
