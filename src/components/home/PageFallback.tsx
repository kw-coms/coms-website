function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-[var(--app-accent)]" />
    </div>
  )
}

export default PageFallback
