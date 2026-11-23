type Point = readonly [number, number]
type TracePath = { line: Path2D; points: Point[]; length: number }
export type CircuitTrace = { trunk: TracePath; branch: TracePath; born: number }

export const CIRCUIT_LIFETIME = 620

function pathOnGrid(cells: Point[], step: number, offset: Point): TracePath {
  const points: Point[] = cells.map(([col, row]) => [offset[0] + col * step, offset[1] + row * step])
  const line = new Path2D()
  line.moveTo(...points[0])
  let length = 0
  for (let i = 1; i < points.length; i++) {
    line.lineTo(...points[i])
    length += Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1])
  }
  return { line, points, length }
}

export function createCircuitTrace(from: Point, to: Point, bounds: Point, step: number, offset: Point, born: number): CircuitTrace {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  // A fast pointer jump makes a short trace near the destination.
  const ratio = Math.min(1, 9 / (Math.abs(dx) + Math.abs(dy) || 1))
  const start: Point = [to[0] - Math.round(dx * ratio), to[1] - Math.round(dy * ratio)]
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const midX = Math.round((start[0] + to[0]) / 2)
  const midY = Math.round((start[1] + to[1]) / 2)
  const junction: Point = horizontal ? [midX, start[1]] : [start[0], midY]
  const corner: Point = horizontal ? [midX, to[1]] : [to[0], midY]
  const crossAxis = horizontal ? 1 : 0
  const towardCenter = junction[crossAxis] >= bounds[crossAxis] / 2 ? -2 : 2
  const crossCell = Math.max(0, Math.min(bounds[crossAxis] - 1, junction[crossAxis] + towardCenter))
  const branchTurn: Point = horizontal ? [junction[0], crossCell] : [crossCell, junction[1]]
  const branchEnd: Point = horizontal
    ? [Math.max(0, Math.min(bounds[0] - 1, branchTurn[0] + Math.sign(dx))), branchTurn[1]]
    : [branchTurn[0], Math.max(0, Math.min(bounds[1] - 1, branchTurn[1] + Math.sign(dy)))]
  return {
    trunk: pathOnGrid([start, junction, corner, to], step, offset),
    branch: pathOnGrid([junction, branchTurn, branchEnd], step, offset),
    born,
  }
}

function drawPulse(ctx: CanvasRenderingContext2D, path: TracePath, progress: number, tail: number, intensity: number, hot: string) {
  if (progress <= 0 || progress >= 1 || path.length === 0) return
  const head = progress * (path.length + tail)
  ctx.globalAlpha = intensity
  ctx.strokeStyle = hot
  ctx.lineWidth = 2
  ctx.setLineDash([tail, path.length + tail])
  ctx.lineDashOffset = tail - head
  ctx.stroke(path.line)
}

export function paintCircuitTrace(ctx: CanvasRenderingContext2D, trace: CircuitTrace, now: number, step: number, color: string, hot: string) {
  const age = now - trace.born
  if (age < 0 || age >= CIRCUIT_LIFETIME) return
  const fade = Math.min(1, (CIRCUIT_LIFETIME - age) / 260)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = fade * 0.48
  ctx.strokeStyle = color
  ctx.lineWidth = 1.35
  ctx.stroke(trace.trunk.line)
  ctx.stroke(trace.branch.line)
  ctx.fillStyle = color
  for (const [x, y] of [trace.branch.points[0], trace.branch.points[trace.branch.points.length - 1]]) {
    ctx.fillRect(x - 2, y - 2, 4, 4)
  }
  drawPulse(ctx, trace.trunk, age / 400, step * 2.6, fade * 0.93, hot)
  drawPulse(ctx, trace.branch, (age - 115) / 325, step * 1.4, fade * 0.85, hot)
  ctx.restore()
}
