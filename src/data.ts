import Papa from 'papaparse'
import type { RaceRow, Summary } from './types'

export const requiredColumns: (keyof RaceRow)[] = [
  'snapshot_date', 'office', 'race_id', 'state', 'primary_status', 'dem_candidate', 'dem_woman',
  'rep_candidate', 'rep_woman', 'race_rating', 'dem_win_probability', 'rep_win_probability',
  'expected_woman', 'candidate_source', 'rating_source', 'gender_source', 'not_up_women_baseline',
]

const numericFields: (keyof RaceRow)[] = ['dem_woman', 'rep_woman', 'dem_win_probability', 'rep_win_probability', 'expected_woman', 'not_up_women_baseline']

export function parseRaceCsv(csv: string): RaceRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: 'greedy' })
  if (parsed.errors.length) throw new Error(`CSV parsing failed: ${parsed.errors[0].message}`)
  const missing = requiredColumns.filter((column) => !parsed.meta.fields?.includes(column))
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`)
  if (!parsed.data.length) throw new Error('The data file contains no races.')

  return parsed.data.map((raw, index) => {
    const row = { ...raw } as unknown as RaceRow
    for (const field of numericFields) {
      const value = Number(raw[field])
      if (!Number.isFinite(value)) throw new Error(`Invalid number in “${field}” on row ${index + 2}.`)
      ;(row[field] as number) = value
    }
    return row
  })
}

export function aggregate(rows: RaceRow[]): Summary {
  const baselines = [...new Set(rows.map((row) => row.not_up_women_baseline))]
  if (baselines.length !== 1) throw new Error('The not-up baseline must have one consistent value.')
  const expectedElected = rows.reduce((sum, row) => sum + row.expected_woman, 0)
  const democratic = rows.reduce((sum, row) => sum + row.dem_woman * row.dem_win_probability, 0)
  const republican = rows.reduce((sum, row) => sum + row.rep_woman * row.rep_win_probability, 0)
  return {
    expectedElected,
    baseline: baselines[0],
    total: expectedElected + baselines[0],
    democratic,
    republican,
    racesWithWomen: rows.filter((row) => row.dem_woman || row.rep_woman).length,
    // Fractional gender values are probability weights for combined same-party
    // candidate fields. The ballot card counts people, not probability weights.
    democraticWomen: rows.filter((row) => row.dem_woman > 0).length,
    republicanWomen: rows.filter((row) => row.rep_woman > 0).length,
  }
}

export function csvDownload(rows: RaceRow[]) {
  const blob = new Blob([Papa.unparse(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'filtered-races.csv'
  link.click()
  URL.revokeObjectURL(url)
}
