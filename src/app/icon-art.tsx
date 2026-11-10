/** The app icon: a bold white "done" circle with a check on a warm-to-violet gradient, easy to spot on a home screen. */
export function IconArt({ size }: { size: number }) {
  const ring = Math.round(size * 0.62);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(140deg, #ff9a1f 0%, #ff4d6d 48%, #7c3aed 100%)",
      }}
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: ring,
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 ${size * 0.03}px ${size * 0.08}px rgba(76, 29, 149, 0.35)`,
        }}
      >
        <svg width={ring * 0.62} height={ring * 0.62} viewBox="0 0 24 24" fill="none">
          <path d="M4.5 12.5l4.8 4.8L19.5 7" stroke="#ff4d6d" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
