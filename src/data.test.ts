import { aggregate, parseRaceCsv } from './data'

const csv = `snapshot_date,office,race_id,state,primary_status,dem_candidate,dem_woman,rep_candidate,rep_woman,race_rating,dem_win_probability,rep_win_probability,expected_woman,candidate_source,rating_source,gender_source,not_up_women_baseline
2026-08-21,Senate,AA,AA,Completed,Alice,1,Bob,0,Toss-up,0.5,0.5,0.5,a,b,c,18
2026-08-21,Senate,BB,BB,Completed,Dan,0,Carol,1,Solid R,0,1,1,a,b,c,18`

test('parses numeric fields and aggregates the forecast', () => {
  const rows = parseRaceCsv(csv)
  expect(rows[0].dem_win_probability).toBe(0.5)
  expect(aggregate(rows)).toEqual({ expectedElected: 1.5, baseline: 18, total: 19.5, democratic: 0.5, republican: 1, racesWithWomen: 2, democraticWomen: 1, republicanWomen: 1 })
})

test('rejects malformed data', () => expect(() => parseRaceCsv('office\nHouse')).toThrow())

test('counts a fractional same-party gender weight as one ballot candidate', () => {
  const fractional = `${csv.split('\n')[0]}\n2026-08-21,House,CA-40,California,Completed,Unknown,0,Ken Calvert / Young Kim,0.5,Solid R,0.1,0.9,0.45,a,b,c,0`
  expect(aggregate(parseRaceCsv(fractional)).republicanWomen).toBe(1)
})
