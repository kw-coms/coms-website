import { useEffect, useState } from 'react'

function TestPage() {
  const [serverTime, setServerTime] = useState('')

  useEffect(() => {
    const fetchTime = () => {
      fetch('/api/server/time')
        .then(response => response.text())
        .then(time => {
          setServerTime(time);
        });
    };

    fetchTime();
    const interval = setInterval(fetchTime, 1000);
    return () => clearInterval(interval);
  }, [])

  return (
    <>
      <div>
        <label>지금시간: {serverTime}</label>
      </div>
    </>
  )
}
export default TestPage
