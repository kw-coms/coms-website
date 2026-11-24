const seoulDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
})

/** The club's calendar date, independent of the browser's time zone. */
export function seoulDateStamp(now = new Date()): string {
  return seoulDate.format(now)
}
