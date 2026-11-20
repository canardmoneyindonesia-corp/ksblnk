/**
 * Full-screen session loop shown instead of the site in waiting mode (see lib/waiting).
 * No JS: muted + playsInline is what lets it autoplay on iOS. If autoplay is refused
 * (Low Power Mode) or the viewer prefers reduced motion, the poster frame shows instead.
 */
export function WaitingScreen() {
  return (
    <div className="waiting">
      <video
        src="/fx/session-loop.mp4"
        poster="/fx/session-loop.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />
    </div>
  )
}
