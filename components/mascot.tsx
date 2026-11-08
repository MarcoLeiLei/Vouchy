type Mood = "happy" | "wow" | "sleepy" | "party";

/** Vouchy – das Ticket mit Gesicht. Eigenes Maskottchen. */
export function Mascot({ size = 64, mood = "happy", className = "" }: { size?: number; mood?: Mood; className?: string }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="-200 -130 400 290" className={className} aria-hidden="true">
      <g transform="rotate(-8)">
        <path
          d="M-170 -110 h340 a20 20 0 0 1 20 20 v52 a38 38 0 0 0 0 76 v52 a20 20 0 0 1 -20 20 h-340 a20 20 0 0 1 -20 -20 v-52 a38 38 0 0 0 0 -76 v-52 a20 20 0 0 1 20 -20z"
          fill="#FF4F8B"
        />
        <line x1="88" y1="-92" x2="88" y2="92" stroke="#2B1B63" strokeWidth="8" strokeDasharray="4 16" strokeLinecap="round" />
        {mood === "sleepy" ? (
          <>
            <path d="M-80 -18 q18 12 36 0" stroke="#2B1B63" strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M-8 -18 q18 12 36 0" stroke="#2B1B63" strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M-50 40 h50" stroke="#2B1B63" strokeWidth="12" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="-62" cy="-18" r={mood === "wow" ? 21 : 17} fill="#2B1B63" />
            <circle cx="10" cy="-18" r={mood === "wow" ? 21 : 17} fill="#2B1B63" />
            <circle cx="-56" cy="-24" r="5" fill="#fff" />
            <circle cx="16" cy="-24" r="5" fill="#fff" />
            {mood === "wow" ? (
              <ellipse cx="-26" cy="42" rx="16" ry="20" fill="#2B1B63" />
            ) : (
              <path d={mood === "party" ? "M-72 26 q46 50 92 0z" : "M-66 30 q40 34 80 0"} fill={mood === "party" ? "#2B1B63" : "none"} stroke="#2B1B63" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </>
        )}
        <path d="M116 -60 l8 -16 l8 16 l16 8 l-16 8 l-8 16 l-8 -16 l-16 -8z" fill="#FFE58A" />
      </g>
    </svg>
  );
}
