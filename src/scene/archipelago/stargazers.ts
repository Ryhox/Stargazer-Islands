// ---------------------------------------------------------------------------
// STARGAZERS — the only external data the archipelago needs: the ordered list of
// who has starred the repo (star order = each island's permanent rank).
//
// localStorage is just a fast cache + rate-limit shield; GitHub is the source of
// truth. Stale-while-revalidate: we serve the cached list instantly, then fetch
// fresh in the background and push any change through `onFresh` so a brand-new
// stargazer's island pops in on the visitor's next sail. No server, no webhook.
// ---------------------------------------------------------------------------

const OWNER = 'Ryhox'
const REPO = 'Stargazer-Islands'
const CACHE_KEY = 'archipelago.stargazers.v2'
// GitHub's /stargazers endpoint now answers 401 without a token, so the list is
// published as a static file by .github/workflows/stargazers.yml and read from
// the raw CDN (CORS-enabled, no API rate limit).
const DATA_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/stargazers-data/stargazers.json`
const TTL = 5 * 60 * 1000 // serve cache without re-hitting the API for 5 min

// Live-refresh cadence. Aligned to a UTC 5-min grid (floor to the grid, +1 step)
// so every visitor refetches — and counts the timer down — in lockstep, and the
// API is hit at most once per 5 min per client (well clear of rate limits).
export const REFRESH_MS = 5 * 60 * 1000
export const nextRefreshAt = (now: number) => Math.floor(now / REFRESH_MS) * REFRESH_MS + REFRESH_MS

type Cache = { ts: number; logins: string[] }

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (c && Array.isArray(c.logins)) return c as Cache
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(logins: string[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), logins } satisfies Cache))
  } catch {
    /* quota / private mode — fine, we just refetch next time */
  }
}

// Stargazers in ascending star date (so index = rank), from the Action-published
// JSON; the minute-bucket query busts stale CDN copies. (GitHub's /stargazers API
// is not an option in the browser: it answers 401 without a token, and a token in
// client code would be public.)
async function fetchAll(): Promise<string[]> {
  const res = await fetch(`${DATA_URL}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' })
  if (res.status === 404) {
    throw new Error('stargazers.json not published yet: push the repo and let the "Publish stargazers" Action run once')
  }
  if (!res.ok) throw new Error(`stargazers.json ${res.status}`)
  const data = (await res.json()) as { logins?: unknown }
  if (!Array.isArray(data.logins)) throw new Error('stargazers.json: bad shape')
  return data.logins.filter((l): l is string => typeof l === 'string')
}

// Returns the best list available NOW (cache or fetch). If it served a stale
// cache, it revalidates in the background and calls `onFresh` only when the list
// actually changed.
export function loadStargazerLogins(onFresh?: (logins: string[]) => void): Promise<string[]> {
  const cache = readCache()
  if (cache && Date.now() - cache.ts < TTL) {
    return Promise.resolve(cache.logins) // fresh enough — no network
  }

  const fetching = fetchAll()
    .then((logins) => {
      writeCache(logins)
      return logins
    })
    .catch((e) => {
      console.warn('[stargazers] fetch failed, using cache/empty', e)
      return cache?.logins ?? []
    })

  if (cache) {
    // Serve stale immediately, push the fresh list through when it lands (if changed).
    const before = cache.logins.join(',')
    fetching.then((logins) => {
      if (onFresh && logins.join(',') !== before) onFresh(logins)
    })
    return Promise.resolve(cache.logins)
  }

  return fetching // no cache yet — wait for the first fetch
}

// Force a fresh pull (bypassing the serve-from-cache TTL) for the periodic
// refresh; updates the cache and falls back to the cached list on failure.
export async function refreshStargazerLogins(): Promise<string[]> {
  try {
    const logins = await fetchAll()
    writeCache(logins)
    return logins
  } catch (e) {
    console.warn('[stargazers] refresh failed, keeping cache', e)
    return readCache()?.logins ?? []
  }
}
