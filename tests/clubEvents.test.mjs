import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const homeContent = readFileSync(new URL('../src/data/homeContent.js', import.meta.url), 'utf8')
const eventApi = readFileSync(new URL('../src/services/clubEventApi.js', import.meta.url), 'utf8')

assert.match(
  app,
  /<Route path="\/activity-events" element={<RequireAuth><ClubEventPage \/><\/RequireAuth>} \/>/,
  'activity events should have a member-only route',
)

assert.match(
  app,
  /CLUB_EVENTS_QUERY_KEY/,
  'app shell should keep club events in a dedicated query cache',
)

assert.match(
  homeContent,
  /path: '\/activity-events'/,
  'activity dropdown should link to event contests',
)

assert.match(
  eventApi,
  /\/api\/club-events/,
  'club event API client should target the backend event endpoints',
)

assert.match(
  eventApi,
  /voteClubEventEntry/,
  'club event API client should expose entry voting',
)

console.log('club event frontend contract passed')
