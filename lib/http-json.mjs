// Never expose a provider's HTML error page or JSON parser exception to the UI.
export function retryDelay(value, now = Date.now(), fallback = 60000) {
  if (!value) return fallback;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - now) : fallback;
}

export async function readJSON(response) {
  const type = response.headers.get('Content-Type') || '';
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(type)) {
    throw new Error('The service returned an unexpected response. Please try again shortly.');
  }
  try { return await response.json(); }
  catch { throw new Error('The service returned an unreadable response. Please try again shortly.'); }
}

/** @param {string} path @param {{signal?: AbortSignal, timeout?: number}} [options] */
export async function fetchJSON(path, {signal, timeout = 25000} = {}) {
  let response;
  try {
    const timeoutSignal = AbortSignal.timeout(timeout);
    response = await fetch(path, {
      headers: {Accept: 'application/json'}, cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(error?.name === 'TimeoutError'
      ? 'The connection took too long. Please try again shortly.'
      : 'Could not connect. Check your internet connection and try again.');
  }
  let data;
  try { data = await readJSON(response); }
  catch (error) { if (response.ok) throw error; }
  if (!response.ok) {
    const safeMessage = typeof data?.error === 'string' && data.error.length <= 300 && !/[<>]/.test(data.error);
    const error = new Error(response.status === 401 || response.status === 403
      ? 'Your session needs to be refreshed. Reload Skyline and sign in again.'
      : safeMessage ? data.error : 'The service is temporarily unavailable. Please try again shortly.');
    error.retryAt = Date.now() + retryDelay(response.headers.get('Retry-After'));
    throw error;
  }
  return data;
}
