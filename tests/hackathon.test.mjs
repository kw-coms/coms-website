import assert from 'node:assert/strict'
import { HACKATHON_PROJECTS, summarizeHackathon, reviewTotal } from '../src/features/hackathon/hackathon.ts'

const review = (projectId, score, chair = false) => ({ projectId, chair, themeFit: score, creativity: score, technology: score, completeness: score, practicality: score })
const summarizeLegacy = (reviews) => summarizeHackathon(reviews, HACKATHON_PROJECTS.map(project => ({ projectId: project.id, title: project.title, id: project.id })))
assert.equal(reviewTotal(review('still', 20)), 100)
assert.equal(summarizeLegacy([]).every((row) => row.finalScore === null && row.rank === null), true)
const rows = summarizeLegacy([
  review('wargether', 10), review('wargether', 20), review('wargether', 20, true),
  review('underground-route', 20), review('underground-route', 10, true),
  review('still', 15), review('still', 15, true),
])
assert.equal(rows[0].project.id, 'wargether')
assert.equal(rows[0].finalScore, 87.5, 'average alumni first, then give each side 50 percent')
assert.equal(rows[0].alumniCount, 2)
assert.deepEqual(rows.slice(1).map((row) => row.rank), [2, 2], 'identical final and tie-break scores share rank')
const tie = summarizeLegacy([
  { ...review('still', 15), completeness: 20, creativity: 10 }, review('still', 15, true),
  review('wargether', 15), review('wargether', 15, true),
  { ...review('underground-route', 15), themeFit: 20, creativity: 10 }, review('underground-route', 15, true),
])
assert.deepEqual(tie.map((row) => row.project.id), ['still', 'underground-route', 'wargether'], 'ties use weighted completeness then theme fit')
const partial = summarizeLegacy([review('still', 15), review('still', 15, true)])
assert.equal(partial.find((row) => row.project.id === 'still').finalScore, 75)
assert.ok(partial.every((row) => row.rank === null), 'do not rank before every project has both judging sides')
const future = summarizeHackathon([review('future-team', 20), review('future-team', 10, true)], [{ projectId: 'future-team', title: '새 행사 팀' }])
assert.equal(future.length, 1)
assert.equal(future[0].finalScore, 75, 'a future event is ranked from its own project list')
console.log('hackathon: 10 scoring, tie-break and incomplete-results checks passed')
