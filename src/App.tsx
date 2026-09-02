import { useEffect, useMemo, useRef, useState } from 'react'
import { aggregate, csvDownload, parseRaceCsv } from './data'
import { historicalRepresentation, historySources, officeDenominators } from './history'
import { formatRaceId, matchesRaceSearch } from './race'
import type { Office, RaceRow } from './types'

const offices: Office[] = ['house', 'senate', 'governor']
type View = Office | 'history'
const views: View[] = [...offices, 'history']
const labels: Record<Office, string> = { house: 'House', senate: 'Senate', governor: 'Governors' }
const viewLabels: Record<View, string> = { ...labels, history: 'REPRESENTATION OVER TIME' }
const representationRecords: Record<Office, { value: number; source: string; sourceLabel: string }> = {
  house: { value: 127, source: 'https://cawp.rutgers.edu/news-media/press-releases/current-congress-temporary-new-records', sourceLabel: 'CAWP' },
  governor: { value: 14, source: 'https://cawp.rutgers.edu/data/levels-office/statewide-elective-executive?tab=Governor', sourceLabel: 'CAWP' },
  senate: { value: 27, source: 'https://www.senate.gov/senators/ListofWomenSenators.htm', sourceLabel: 'U.S. Senate' },
}
const notUpWomenByParty: Record<Office, { democratic: number; republican: number }> = {
  house: { democratic: 0, republican: 0 },
  governor: { democratic: 2, republican: 0 },
  senate: { democratic: 14, republican: 4 },
}
const ratingOrder = ['Toss-up', 'Lean D', 'Lean R', 'Likely D', 'Likely R', 'Solid D', 'Solid R']

function viewFromUrl(): View {
  const value = new URLSearchParams(window.location.search).get('office')?.toLowerCase()
  return views.includes(value as View) ? value as View : 'house'
}

function ratingClass(rating: string) { return `rating-${rating.toLowerCase().replaceAll(' ', '-').replace('-up', 'up')}` }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }

function App() {
  const [view, setView] = useState<View>(viewFromUrl)
  const [rows, setRows] = useState<RaceRow[]>([])
  const [projectionRows, setProjectionRows] = useState<Partial<Record<Office, RaceRow[]>>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    Promise.all(offices.map((item) => fetch(`${import.meta.env.BASE_URL}data/${item}.csv`)
      .then((response) => { if (!response.ok) throw new Error(`Could not load ${labels[item]} projection.`); return response.text() })
      .then((text) => [item, parseRaceCsv(text)] as const)))
      .then((entries) => setProjectionRows(Object.fromEntries(entries) as Partial<Record<Office, RaceRow[]>>))
      .catch(() => setProjectionRows({}))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('office', view)
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)
    if (view === 'history') return
    const office = view
    setLoading(true); setError('')
    fetch(`${import.meta.env.BASE_URL}data/${office}.csv`)
      .then((response) => { if (!response.ok) throw new Error(`Could not load ${labels[office]} data (${response.status}).`); return response.text() })
      .then((text) => setRows(parseRaceCsv(text)))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load this data file.'))
      .finally(() => setLoading(false))
  }, [view])

  function tabKey(event: React.KeyboardEvent, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % views.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + views.length) % views.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = views.length - 1
    else return
    event.preventDefault(); setView(views[next]); tabs.current[next]?.focus()
  }

  return <>
    <header className="masthead">
      <div className="shell header-inner">
        <a className="brand" href="?office=house" aria-label="More Women in Office home"><span className="brand-mark" aria-hidden="true">MW</span><span>More Women <i>in</i> Office</span></a>
        <span className="edition">2026 ELECTION OUTLOOK</span>
      </div>
    </header>
    <main>
      <section className="hero shell">
        <p className="eyebrow">THE 2026 OUTLOOK</p>
        <h1>How many women will<br />serve after the election?</h1>
        <p className="dek">A race-by-race estimate of women serving in Congress and governor’s offices, based on candidate information and win probabilities sourced from Kalshi.</p>
      </section>
      <div className="tab-wrap"><div className="shell tabs" role="tablist" aria-label="Choose a view">
        {views.map((item, index) => <button key={item} ref={(node) => { tabs.current[index] = node }} role="tab" aria-selected={view === item} aria-controls="dashboard" tabIndex={view === item ? 0 : -1} onKeyDown={(event) => tabKey(event, index)} onClick={() => setView(item)}>{viewLabels[item]}</button>)}
      </div></div>
      {view === 'history'
        ? <div id="dashboard" role="tabpanel" aria-live="polite"><RepresentationChart projectionRows={projectionRows} /></div>
        : <section id="dashboard" role="tabpanel" className="shell dashboard" aria-live="polite">
          {loading && <div className="status">Loading {labels[view]} outlook…</div>}
          {error && <div className="error" role="alert"><strong>We couldn’t show this outlook.</strong><span>{error}</span></div>}
          {!loading && !error && <Dashboard rows={rows} office={view} />}
        </section>}
    </main>
    <footer><div className="shell"><span>More Women in Office</span><span>Independent data presentation · 2026</span></div></footer>
  </>
}

function RepresentationChart({ projectionRows }: { projectionRows: Partial<Record<Office, RaceRow[]>> }) {
  const chartOffices: Office[] = ['house', 'senate', 'governor']
  const colors: Record<Office, string> = { house: '#2869a7', senate: '#7c5aa4', governor: '#aa493f' }
  const projectionPoints = chartOffices.flatMap((item) => {
    const officeRows = projectionRows[item]
    if (!officeRows?.length) return []
    const summary = aggregate(officeRows)
    return [{ year: 2026, office: item, percent: summary.total / officeDenominators[item] * 100, kind: 'projection' as const }]
  })
  const points = [...historicalRepresentation, ...projectionPoints]
  const years = points.map((point) => point.year)
  const minYear = 1990
  const maxYear = Math.max(2026, ...years)
  const maxPercent = Math.ceil(Math.max(32, ...points.map((point) => point.percent)) / 5) * 5
  const width = 960
  const height = 430
  const margin = { top: 28, right: 34, bottom: 54, left: 54 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const x = (year: number) => margin.left + (year - minYear) / (maxYear - minYear) * plotWidth
  const y = (percent: number) => margin.top + (maxPercent - percent) / maxPercent * plotHeight
  const yearTicks = [1990, 2000, 2010, 2020, 2026]
  const percentTicks = Array.from({ length: maxPercent / 5 + 1 }, (_, index) => index * 5)
  const projected = projectionPoints.length === chartOffices.length

  function pathFor(item: Office) {
    return historicalRepresentation
      .filter((point) => point.office === item && point.year >= minYear)
      .map((point, index) => `${index ? 'L' : 'M'} ${x(point.year).toFixed(2)} ${y(point.percent).toFixed(2)}`)
      .join(' ')
  }

  return <section className="history-section shell" aria-labelledby="history-title">
    <div className="section-heading history-heading"><div><p className="eyebrow">SINCE 1990</p><h2 id="history-title">Women’s representation over time</h2></div><p>{projected ? 'Final dots show the 2026 projection from this outlook.' : 'Loading 2026 projection dots…'}</p></div>
    <div className="history-card">
      <svg className="history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart showing women as a percentage of the House, Senate, and governorships since 1990, with 2026 projection dots.">
        {percentTicks.map((tick) => <g key={tick}>
          <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="grid-line" />
          <text x={margin.left - 12} y={y(tick) + 4} textAnchor="end" className="axis-label">{tick}%</text>
        </g>)}
        {yearTicks.map((tick) => <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} className="axis-tick" />
          <text x={x(tick)} y={height - margin.bottom + 27} textAnchor="middle" className="axis-label">{tick}</text>
        </g>)}
        <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} className="axis-line" />
        <line x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} className="axis-line" />
        <line x1={x(2025)} x2={x(2026)} y1={margin.top} y2={height - margin.bottom} className="projection-boundary" />
        {chartOffices.map((item) => <path key={item} d={pathFor(item)} fill="none" stroke={colors[item]} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />)}
        {projectionPoints.map((point) => {
          const previous = historicalRepresentation.filter((item) => item.office === point.office).at(-1)
          return <g key={point.office}>
            {previous && <line x1={x(previous.year)} y1={y(previous.percent)} x2={x(point.year)} y2={y(point.percent)} stroke={colors[point.office]} strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" />}
            <circle cx={x(point.year)} cy={y(point.percent)} r="7.5" fill="#fffefa" stroke={colors[point.office]} strokeWidth="3" />
            <text x={x(point.year) - 10} y={y(point.percent) - 13} textAnchor="end" className="projection-label" style={{ fill: colors[point.office] }}>{point.percent.toFixed(1)}%</text>
          </g>
        })}
      </svg>
      <div className="history-legend">
        {chartOffices.map((item) => <span key={item}><i style={{ background: colors[item] }} />{labels[item]}</span>)}
        <span className="projection-key"><i />2026 projection</span>
      </div>
      <p className="history-note">House and Senate history uses the share at the outset of each Congress; governorship history uses annual shares of the 50 state governorships. 2026 projections are calculated from the current race-level outlook files.</p>
      <div className="history-sources">{historySources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true"> ↗</span></a>)}</div>
    </div>
  </section>
}

function Dashboard({ rows, office }: { rows: RaceRow[], office: Office }) {
  const summary = useMemo(() => aggregate(rows), [rows])
  const sources = useMemo(() => [...new Set(rows.flatMap((row) => [row.candidate_source, row.rating_source, row.gender_source]).filter(Boolean))], [rows])
  const record = representationRecords[office]
  const partyBaseline = notUpWomenByParty[office]

  return <>
    <div className="section-heading"><div><p className="eyebrow">{labels[office].toUpperCase()} OUTLOOK</p><h2>Expected representation</h2></div><p>Data snapshot <strong>{formatDate(rows[0].snapshot_date)}</strong></p></div>
    <div className="kpi-grid">
      <article className="kpi primary-kpi"><p>Expected women after the<br />2026 election</p><strong>{summary.total.toFixed(1)}</strong><span>of {office === 'house' ? '435 representatives' : office === 'governor' ? '50 governors' : '100 senators'}</span></article>
      <div className="small-kpis">
        <article className="kpi"><p>Expected from<br />2026 races</p><strong>{summary.expectedElected.toFixed(1)}</strong></article>
        <article className="kpi"><p>Not up in<br />2026</p><strong>{summary.baseline}</strong><span>{office === 'house' ? 'All seats are up' : 'Current baseline'}</span></article>
        <article className="kpi party-combined"><p>Party contribution</p><div className="party-contributions"><span><small><i className="dot blue" />Democratic</small><strong>{summary.democratic.toFixed(1)}</strong>{office !== 'house' && <em>Total: {(summary.democratic + partyBaseline.democratic).toFixed(1)}</em>}</span><span><small><i className="dot red" />Republican</small><strong>{summary.republican.toFixed(1)}</strong>{office !== 'house' && <em>Total: {(summary.republican + partyBaseline.republican).toFixed(1)}</em>}</span></div></article>
        <article className="kpi record-kpi"><p>Current record</p><strong>{record.value}</strong><a href={record.source} target="_blank" rel="noreferrer">Record high · {record.sourceLabel} <span aria-hidden="true">↗</span></a></article>
      </div>
    </div>
    <div className="insight-grid">
      <article className="method"><span className="number">01</span><div><h3>How the estimate is calculated</h3><p>This site does not produce its own election probabilities. It uses win probabilities sourced from Kalshi and applies them to the candidates in each race. A female candidate’s contribution is her probability of winning; adding those contributions across all races yields the expected number of women elected.</p></div></article>
      <article className="candidate-count"><span className="number">02</span><div><h3>Women on the ballot</h3><p><strong>{summary.racesWithWomen}</strong> races feature at least one female major-party candidate.</p><div className="party-counts"><span><i className="dot blue" />{summary.democraticWomen} Democratic</span><span><i className="dot red" />{summary.republicanWomen} Republican</span></div></div></article>
    </div>
    <RaceTable rows={rows} office={office} />
    <section className="sources"><p className="eyebrow">NOTES & SOURCES</p><h2>About this estimate</h2><div className="source-columns"><div><h3>Methodology</h3><p>The site combines published candidate information with win probabilities sourced from Kalshi; it does not independently model election outcomes. For Dem vs. Rep races, the expected women in office is computed as <code>Dem woman × Dem win probability + Rep woman × Rep win probability</code>. Candidate-level markets are used for same-party contests and other nonstandard matchups.</p><p>The race-level contributions are summed and, for offices with staggered terms, added to the number of women whose seats are not up in 2026. Where a nomination remains unresolved, we assume non-retiring incumbents will receive their party's nomination. The estimate will change as primaries conclude and Kalshi prices move.</p></div><div><h3>Source links</h3><ul>{sources.map((source, index) => <li key={source}><a href={source} target="_blank" rel="noreferrer">Source {index + 1}<span aria-hidden="true"> ↗</span></a></li>)}</ul></div></div></section>
  </>
}

type SortKey = 'race' | 'primary_status' | 'dem_candidate' | 'rep_candidate' | 'race_rating' | 'dem_win_probability' | 'rep_win_probability' | 'expected_woman'
type OtherSortKey = 'race' | 'primary_status' | 'candidate_1' | 'candidate_2' | 'race_rating' | 'candidate_1_win' | 'candidate_2_win' | 'expected_woman'

type DisplayCandidate = { name: string; party: string; probability: number; female: boolean }

const knownFemaleCandidates = new Set([
  'Doris Matsui', 'Mai Vang', 'Connie Chan', 'Jamie Joyce', 'Lateefah Simon',
  'Melissa Hernandez', 'Aisha Wahab', 'Angelica Dueñas', 'Luz Rivas',
  'Angela Gonzales-Torres', 'Sydney Kamlager-Dove', 'Samantha Mota', 'Young Kim',
  'Stefany Shaheen', 'Maura Sullivan',
])

const samePartyProbabilities: Record<string, [number, number]> = {
  'CA-4': [0.675, 0.325], 'CA-7': [0.536585, 0.463415], 'CA-11': [0.345, 0.655],
  'CA-12': [0.915423, 0.084577], 'CA-14': [0.865, 0.135], 'CA-29': [0.893939, 0.106061],
  'CA-34': [0.185, 0.815], 'CA-37': [0.954315, 0.045685], 'CA-40': [0.69697, 0.30303],
}

function isSettledDemVsRep(row: RaceRow) {
  const unsettledStatus = /future|progress|unresolved|top-four|open primary|too close/i.test(row.primary_status)
  const exceptionalNotes = /top-two|top-four|jungle|no (democratic|republican)|unknown|not yet|canceled/i.test(row.notes)
  return row.dem_candidate !== 'Unknown' && row.rep_candidate !== 'Unknown' && !row.dem_candidate.includes(' / ') && !row.rep_candidate.includes(' / ') && !unsettledStatus && !exceptionalNotes
}

function otherCandidates(row: RaceRow): [DisplayCandidate, DisplayCandidate] {
  if (row.race_id === 'AK-AL') return [
    { name: row.dem_candidate, party: 'I', probability: row.dem_win_probability, female: Boolean(row.dem_woman) },
    { name: row.rep_candidate, party: 'R', probability: row.rep_win_probability, female: Boolean(row.rep_woman) },
  ]

  if (row.race_id === 'CA-6') return [
    { name: 'Richard Pan', party: 'D', probability: row.dem_win_probability, female: false },
    { name: 'Kevin Kiley', party: 'I', probability: row.rep_win_probability, female: false },
  ]

  const combined = row.dem_candidate.includes(' / ') ? { names: row.dem_candidate.split(' / '), party: 'D' } : row.rep_candidate.includes(' / ') ? { names: row.rep_candidate.split(' / '), party: 'R' } : null
  if (combined) {
    const femaleFirst = knownFemaleCandidates.has(combined.names[0])
    const femaleSecond = knownFemaleCandidates.has(combined.names[1])
    const [firstProbability, secondProbability] = samePartyProbabilities[row.race_id] ?? [0.5, 0.5]
    return [
      { name: combined.names[0], party: combined.party, probability: firstProbability, female: femaleFirst },
      { name: combined.names[1], party: combined.party, probability: secondProbability, female: femaleSecond },
    ]
  }

  if (['LA-1', 'LA-3', 'LA-4'].includes(row.race_id)) return [
    { name: row.rep_candidate, party: 'R', probability: row.rep_win_probability, female: Boolean(row.rep_woman) },
    { name: row.dem_candidate === 'Unknown' ? 'Unresolved' : row.dem_candidate, party: row.dem_candidate === 'Unknown' ? '—' : 'D', probability: row.dem_win_probability, female: Boolean(row.dem_woman) },
  ]

  return [
    { name: row.dem_candidate === 'Unknown' ? 'Unresolved' : row.dem_candidate, party: row.dem_candidate === 'Unknown' ? '—' : 'D', probability: row.dem_win_probability, female: Boolean(row.dem_woman) },
    { name: row.rep_candidate === 'Unknown' ? 'Unresolved' : row.rep_candidate, party: row.rep_candidate === 'Unknown' || row.rep_candidate === 'None/Minor' ? '—' : 'R', probability: row.rep_win_probability, female: Boolean(row.rep_woman) },
  ]
}

function RaceTable({ rows, office }: { rows: RaceRow[], office: Office }) {
  const [search, setSearch] = useState(''); const [stateFilter, setStateFilter] = useState(''); const [womenOnly, setWomenOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('race_rating'); const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [otherSort, setOtherSort] = useState<OtherSortKey>('race'); const [otherDirection, setOtherDirection] = useState<'asc' | 'desc'>('asc')
  const [regularLimit, setRegularLimit] = useState(25); const [otherLimit, setOtherLimit] = useState(10)
  const [regularPage, setRegularPage] = useState(1); const [otherPage, setOtherPage] = useState(1)
  const stateOptions = [...new Set(rows.map((row) => row.state))].sort()
  const raceLabel = office === 'house' ? 'District' : 'State'
  const filtered = useMemo(() => rows.filter((row) => {
    return matchesRaceSearch(row, search, office) && (!stateFilter || row.state === stateFilter) && (!womenOnly || Boolean(row.dem_woman || row.rep_woman))
  }).sort((a, b) => {
    const raceA = office === 'house' ? formatRaceId(a.race_id) : a.state; const raceB = office === 'house' ? formatRaceId(b.race_id) : b.state
    const value = (row: RaceRow): string | number => sort === 'race' ? (office === 'house' ? formatRaceId(row.race_id) : row.state) : sort === 'race_rating' ? ratingOrder.indexOf(row.race_rating) : row[sort]
    const result = typeof value(a) === 'number' ? Number(value(a)) - Number(value(b)) : String(value(a)).localeCompare(String(value(b)))
    return (result || raceA.localeCompare(raceB)) * (direction === 'asc' ? 1 : -1)
  }), [rows, search, stateFilter, womenOnly, sort, direction, office])

  function changeSort(key: SortKey) { if (sort === key) setDirection(direction === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDirection('asc') } }
  const SortButton = ({ column, children }: { column: SortKey, children: React.ReactNode }) => <button className="sort" onClick={() => changeSort(column)} aria-label={`Sort by ${children}`}>{children}<span aria-hidden="true">{sort === column ? direction === 'asc' ? ' ↑' : ' ↓' : ' ↕'}</span></button>

  function changeOtherSort(key: OtherSortKey) { if (otherSort === key) setOtherDirection(otherDirection === 'asc' ? 'desc' : 'asc'); else { setOtherSort(key); setOtherDirection('asc') } }
  const OtherSortButton = ({ column, children }: { column: OtherSortKey, children: React.ReactNode }) => <button className="sort" onClick={() => changeOtherSort(column)} aria-label={`Sort other races by ${children}`}>{children}<span aria-hidden="true">{otherSort === column ? otherDirection === 'asc' ? ' ↑' : ' ↓' : ' ↕'}</span></button>

  const regularRows = office === 'house' ? filtered.filter(isSettledDemVsRep) : filtered
  const otherRows = office === 'house' ? filtered.filter((row) => !isSettledDemVsRep(row)).sort((a, b) => {
    const [a1, a2] = otherCandidates(a); const [b1, b2] = otherCandidates(b)
    const value = (row: RaceRow, first: DisplayCandidate, second: DisplayCandidate): string | number => otherSort === 'race' ? formatRaceId(row.race_id) : otherSort === 'primary_status' ? row.primary_status : otherSort === 'candidate_1' ? first.name : otherSort === 'candidate_2' ? second.name : otherSort === 'race_rating' ? ratingOrder.indexOf(row.race_rating) : otherSort === 'candidate_1_win' ? first.probability : otherSort === 'candidate_2_win' ? second.probability : row.expected_woman
    const aValue = value(a, a1, a2); const bValue = value(b, b1, b2)
    const result = typeof aValue === 'number' ? Number(aValue) - Number(bValue) : String(aValue).localeCompare(String(bValue))
    return (result || formatRaceId(a.race_id).localeCompare(formatRaceId(b.race_id))) * (otherDirection === 'asc' ? 1 : -1)
  }) : []
  const CandidateCell = ({ candidate }: { candidate: DisplayCandidate }) => <><span className="candidate"><i className={`party-line ${candidate.party === 'D' ? 'blue' : candidate.party === 'R' ? 'red' : 'neutral'}`} />{candidate.name} <small>({candidate.party})</small></span>{candidate.female && <span className="woman-badge">FEMALE</span>}</>
  const RegularCandidateCell = ({ row, side }: { row: RaceRow; side: 'D' | 'R' }) => {
    const candidate = side === 'D' ? row.dem_candidate : row.rep_candidate
    const female = Boolean(side === 'D' ? row.dem_woman : row.rep_woman)
    const independent = side === 'D' && (/\(I\)/.test(candidate) || /independent/i.test(row.dem_gender_basis))
    const party = independent ? 'I' : side
    const name = candidate === 'Unknown' ? 'Unresolved' : candidate.replace(/\s*\(I\)\s*$/, '')
    return <><span className="candidate"><i className={`party-line ${party === 'D' ? 'blue' : party === 'R' ? 'red' : 'neutral'}`} />{name}{independent && <> <small>(I)</small></>}</span>{female && <span className="woman-badge">FEMALE</span>}</>
  }

  const regularPages = Math.max(1, Math.ceil(regularRows.length / regularLimit)); const currentRegularPage = Math.min(regularPage, regularPages)
  const otherPages = Math.max(1, Math.ceil(otherRows.length / otherLimit)); const currentOtherPage = Math.min(otherPage, otherPages)
  const visibleRegularRows = regularRows.slice((currentRegularPage - 1) * regularLimit, currentRegularPage * regularLimit)
  const visibleOtherRows = otherRows.slice((currentOtherPage - 1) * otherLimit, currentOtherPage * otherLimit)
  const TableControls = ({ page, pages, limit, total, defaults, setPage, setLimit }: { page: number; pages: number; limit: number; total: number; defaults: number[]; setPage: (page: number) => void; setLimit: (limit: number) => void }) => <div className="table-controls"><label>Rows per page <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1) }}>{defaults.map((value) => <option key={value} value={value}>{value}</option>)}<option value={total}>All</option></select></label>{pages > 1 && <nav className="pagination" aria-label="Table pages"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button></nav>}</div>

  return <section className="races">
    {office === 'senate' && <aside className="senate-baseline-note"><strong>Note:</strong> Incumbent senators Marsha Blackburn (R–TN) and Amy Klobuchar (D–MN) are both running for governor in their respective states. As both are favored to win, they are likely to leave the Senate next year. Nonetheless, they are included in the current baseline count.</aside>}
    <div className="section-heading compact"><div><p className="eyebrow">RACE BY RACE</p><h2>The full field</h2></div><button className="download" onClick={() => csvDownload(filtered)}>Download filtered CSV <span aria-hidden="true">↓</span></button></div>
    <div className="filters"><label className="search"><span>Search races and candidates</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by race or candidate…" /></label><label><span>State</span><select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="">All states</option>{stateOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={womenOnly} onChange={(e) => setWomenOnly(e.target.checked)} /><span>At least one woman</span></label></div>
    <p className="result-count">Showing <strong>{filtered.length}</strong> of {rows.length} matching races</p>
    <h3 className="table-title">{office === 'house' ? 'Democrat vs. Republican races' : `${office === 'senate' ? 'Senate' : 'Governor'} races`} <span>{regularRows.length}</span></h3>
    <div className="table-scroll"><table className="house-table"><thead><tr className="source-row"><th colSpan={4} /><th colSpan={2}>Kalshi</th><th /></tr><tr><th><SortButton column="race">{raceLabel}</SortButton></th><th><SortButton column="dem_candidate">Democratic candidate</SortButton></th><th><SortButton column="rep_candidate">Republican candidate</SortButton></th><th><SortButton column="race_rating">Cook rating</SortButton></th><th className="numeric"><SortButton column="dem_win_probability">D win</SortButton></th><th className="numeric"><SortButton column="rep_win_probability">R win</SortButton></th><th className="numeric"><SortButton column="expected_woman">Expected women</SortButton></th></tr></thead><tbody>{visibleRegularRows.map((row) => <tr key={row.race_id}><td className="race-name"><strong>{office === 'house' ? formatRaceId(row.race_id) : row.state}</strong></td><td><RegularCandidateCell row={row} side="D" /></td><td><RegularCandidateCell row={row} side="R" /></td><td><span className={`rating-pill ${ratingClass(row.race_rating)}`}>{row.race_rating}</span></td><td className="numeric probability">{(row.dem_win_probability * 100).toFixed(0)}%</td><td className="numeric probability">{(row.rep_win_probability * 100).toFixed(0)}%</td><td className="numeric expected">{row.expected_woman.toFixed(1)}</td></tr>)}</tbody></table></div>
    <TableControls page={currentRegularPage} pages={regularPages} limit={regularLimit} total={regularRows.length} defaults={[25, 50, 100]} setPage={setRegularPage} setLimit={setRegularLimit} />
    {office === 'house' && <><h3 className="table-title other-title">Other races <span>{otherRows.length}</span></h3><p className="table-explainer">Same-party contests, nonpartisan formats, and races with an unsettled nominee.</p><div className="table-scroll"><table className="house-table other-races-table"><thead><tr className="source-row"><th colSpan={5} /><th colSpan={2}>Kalshi</th><th /></tr><tr><th><OtherSortButton column="race">District</OtherSortButton></th><th><OtherSortButton column="primary_status">Primary status</OtherSortButton></th><th><OtherSortButton column="candidate_1">Candidate 1</OtherSortButton></th><th><OtherSortButton column="candidate_2">Candidate 2</OtherSortButton></th><th><OtherSortButton column="race_rating">Cook rating</OtherSortButton></th><th className="numeric"><OtherSortButton column="candidate_1_win">Candidate 1 win</OtherSortButton></th><th className="numeric"><OtherSortButton column="candidate_2_win">Candidate 2 win</OtherSortButton></th><th className="numeric"><OtherSortButton column="expected_woman">Expected women</OtherSortButton></th></tr></thead><tbody>{visibleOtherRows.map((row) => { const [first, second] = otherCandidates(row); return <tr key={row.race_id}><td className="race-name"><strong>{formatRaceId(row.race_id)}</strong></td><td>{row.primary_status}</td><td><CandidateCell candidate={first} /></td><td><CandidateCell candidate={second} /></td><td><span className={`rating-pill ${ratingClass(row.race_rating)}`}>{row.race_rating}</span></td><td className="numeric probability">{(first.probability * 100).toFixed(0)}%</td><td className="numeric probability">{(second.probability * 100).toFixed(0)}%</td><td className="numeric expected">{row.expected_woman.toFixed(1)}</td></tr> })}</tbody></table></div><TableControls page={currentOtherPage} pages={otherPages} limit={otherLimit} total={otherRows.length} defaults={[10, 25, 50]} setPage={setOtherPage} setLimit={setOtherLimit} /></>}
    {!filtered.length && <p className="empty">No races match these filters.</p>}
  </section>
}

export default App
