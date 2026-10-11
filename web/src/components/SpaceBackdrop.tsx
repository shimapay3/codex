export default function SpaceBackdrop() {
  return (
    <>
      <div className="space-bg" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none fixed -left-24 top-24 h-64 w-64 animate-float rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 68%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -right-24 top-1/3 h-72 w-72 animate-float rounded-full opacity-25 blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--accent-2), transparent 68%)',
          animationDelay: '1.4s',
        }}
      />
    </>
  )
}
