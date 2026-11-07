/** Restrict the development compiler to loopback before any request or proxy is made. */
export function compileOrigin(value = process.env.LAB_COMPILE_URL ?? 'http://127.0.0.1:8787') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LAB_COMPILE_URL은 로컬 http(s) 주소여야 합니다.');
  }
  const protocol = url.protocol === 'http:' ? 'http:' : url.protocol === 'https:' ? 'https:' : null;
  const host = url.hostname === '127.0.0.1' ? '127.0.0.1'
    : url.hostname === 'localhost' ? 'localhost'
    : url.hostname === '[::1]' ? '[::1]' : null;
  const port = url.port === '' ? '' : Number(url.port);
  if (!protocol || !host || (port !== '' && (!Number.isInteger(port) || port < 1 || port > 65535)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('LAB_COMPILE_URL은 127.0.0.1, localhost 또는 ::1의 로컬 http(s) 주소여야 합니다.');
  }
  return new URL(`${protocol}//${host}${port === '' ? '' : `:${port}`}`).origin;
}
