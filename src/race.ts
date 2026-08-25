import type { Office, RaceRow } from './types'

export function formatRaceId(raceId: string) { return raceId.replace(/-(\d)$/, '-0$1') }

export function matchesRaceSearch(row: RaceRow, search: string, office: Office) {
  const query = search.trim().toLowerCase()
  if (!query) return true
  const raceIds = office === 'house' ? `${row.race_id} ${formatRaceId(row.race_id)}` : row.race_id
  return `${raceIds} ${row.state} ${row.dem_candidate} ${row.rep_candidate}`.toLowerCase().includes(query)
}
