export default function Dots({ level }: { level: number }) {
  return <span className="ex-dots" role="img" aria-label={`난이도 ${level} / 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} data-on={n <= level || undefined} />)}</span>
}
