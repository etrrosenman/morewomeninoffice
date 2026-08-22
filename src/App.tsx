import { useEffect, useMemo, useRef, useState } from 'react'
import { aggregate, csvDownload, parseRaceCsv } from './data'
import type { Office, RaceRow } from './types'

const offices: Office[] = ['house', 'governor', 'senate']
const labels: Record<Office, string> = { house: 'House', governor: 'Governor', senate: 'Senate' }
const ratingOrder = ['Toss-up', 'Lean D', 'Lean R', 'Likely D', 'Likely R', 'Solid D', 'Solid R']

function officeFromUrl(): Office {
  const value = new URLSearchParams(window.location.search).get('office')?.toLowerCase()
  return offices.includes(value as Office) ? value as Office : 'house'
}

function ratingClass(rating: string) { return `rating-${rating.toLowerCase().replaceAll(' ', '-').replace('-up', 'up')}` }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }

function App() {
  const [office, setOffice] = useState<Office>(officeFromUrl)
  const [rows, setRows] = useState<RaceRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('office', office)
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)
    setLoading(true); setError('')
    fetch(`${import.meta.env.BASE_URL}data/${office}.csv`)
      .then((response) => { if (!response.ok) throw new Error(`Could not load ${labels[office]} data (${response.status}).`); return response.text() })
      .then((text) => setRows(parseRaceCsv(text)))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load this data file.'))
      .finally(() => setLoading(false))
  }, [office])

  function tabKey(event: React.KeyboardEvent, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % offices.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + offices.length) % offices.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = offices.length - 1
    else return
    event.preventDefault(); setOffice(offices[next]); tabs.current[next]?.focus()
  }

  return <>
    <header className="masthead">
      <div className="shell header-inner">
        <a className="brand" href="?office=house" aria-label="More Women in Office home"><span className="brand-mark" aria-hidden="true">MW</span><span>More Women <i>in</i> Office</span></a>
        <span className="edition">2026 ELECTION FORECAST</span>
      </div>
    </header>
    <main>
      <section className="hero shell">
        <p className="eyebrow">THE 2026 OUTLOOK</p>
        <h1>How many women will<br />serve after the election?</h1>
        <p className="dek">A race-by-race forecast of women serving in Congress and governor’s offices, using major-party candidates and published race-rating probabilities.</p>
      </section>
      <div className="tab-wrap"><div className="shell tabs" role="tablist" aria-label="Choose an office">
        {offices.map((item, index) => <button key={item} ref={(node) => { tabs.current[index] = node }} role="tab" aria-selected={office === item} aria-controls="dashboard" tabIndex={office === item ? 0 : -1} onKeyDown={(event) => tabKey(event, index)} onClick={() => setOffice(item)}>{labels[item]}</button>)}
      </div></div>
      <section id="dashboard" role="tabpanel" className="shell dashboard" aria-live="polite">
        {loading && <div className="status">Loading {labels[office]} forecast…</div>}
        {error && <div className="error" role="alert"><strong>We couldn’t show this forecast.</strong><span>{error}</span></div>}
        {!loading && !error && <Dashboard rows={rows} office={office} />}
      </section>
    </main>
    <footer><div className="shell"><span>More Women in Office</span><span>Independent data presentation · 2026</span></div></footer>
  </>
}

function Dashboard({ rows, office }: { rows: RaceRow[], office: Office }) {
  const summary = useMemo(() => aggregate(rows), [rows])
  const sources = useMemo(() => [...new Set(rows.flatMap((row) => [row.candidate_source, row.rating_source, row.gender_source]).filter(Boolean))], [rows])
  const ratings = useMemo(() => ratingOrder.map((name) => ({ name, count: rows.filter((row) => row.race_rating === name).length })).filter((item) => item.count), [rows])
  const max = Math.max(...ratings.map((item) => item.count))

  return <>
    <div className="section-heading"><div><p className="eyebrow">{labels[office].toUpperCase()} FORECAST</p><h2>Expected representation</h2></div><p>Data snapshot <strong>{formatDate(rows[0].snapshot_date)}</strong></p></div>
    <div className="kpi-grid">
      <article className="kpi primary-kpi"><p>Expected women after the<br />2026 election</p><strong>{summary.total.toFixed(3)}</strong><span>of {office === 'house' ? '435 representatives' : office === 'governor' ? '50 governors' : '100 senators'}</span></article>
      <div className="small-kpis">
        <article className="kpi"><p>Expected from<br />2026 races</p><strong>{summary.expectedElected.toFixed(3)}</strong></article>
        <article className="kpi"><p>Not up in<br />2026</p><strong>{summary.baseline}</strong><span>{office === 'house' ? 'All seats are up' : 'Current baseline'}</span></article>
        <article className="kpi party dem"><p>Democratic<br />contribution</p><strong>{summary.democratic.toFixed(3)}</strong></article>
        <article className="kpi party rep"><p>Republican<br />contribution</p><strong>{summary.republican.toFixed(3)}</strong></article>
      </div>
    </div>
    <div className="insight-grid">
      <article className="method"><span className="number">01</span><div><h3>How the forecast works</h3><p>Each race contributes <code>Dem woman × Dem win probability + Rep woman × Rep win probability</code>. These are transformations of supplied race ratings—not probabilities independently produced by this site.</p></div></article>
      <article className="candidate-count"><span className="number">02</span><div><h3>Women on the ballot</h3><p><strong>{summary.racesWithWomen}</strong> races feature at least one woman major-party candidate.</p><div className="party-counts"><span><i className="dot blue" />{summary.democraticWomen} Democratic</span><span><i className="dot red" />{summary.republicanWomen} Republican</span></div></div></article>
    </div>
    <section className="ratings-section"><div className="section-heading compact"><div><p className="eyebrow">THE LANDSCAPE</p><h2>Race ratings</h2></div><p>{rows.length} races in this forecast</p></div><div className="rating-bars">{ratings.map(({ name, count }) => <div className="bar-row" key={name}><span>{name}</span><div className="track"><i className={ratingClass(name)} style={{ width: `${Math.max(2, count / max * 100)}%` }} /></div><strong>{count}</strong></div>)}</div></section>
    <RaceTable rows={rows} office={office} />
    <section className="sources"><p className="eyebrow">NOTES & SOURCES</p><h2>About this forecast</h2><div className="source-columns"><div><h3>Methodology</h3><p>Candidate, rating, and gender sources are stored row-by-row in the CSV. Woman status comes only from the supplied binary fields; the site does not infer gender from names. Unresolved candidates receive woman weight 0.</p><p>Values will change as primaries conclude and race ratings shift. The CSV files remain the single source of truth.</p></div><div><h3>Source links</h3><ul>{sources.map((source, index) => <li key={source}><a href={source} target="_blank" rel="noreferrer">Source {index + 1}<span aria-hidden="true"> ↗</span></a></li>)}</ul></div></div></section>
  </>
}

type SortKey = 'race' | 'primary_status' | 'dem_candidate' | 'rep_candidate' | 'race_rating' | 'expected_woman'
function RaceTable({ rows, office }: { rows: RaceRow[], office: Office }) {
  const [search, setSearch] = useState(''); const [rating, setRating] = useState(''); const [primary, setPrimary] = useState(''); const [womenOnly, setWomenOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('race_rating'); const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const primaryOptions = [...new Set(rows.map((row) => row.primary_status))].sort()
  const raceLabel = office === 'house' ? 'District' : 'State'
  const filtered = useMemo(() => rows.filter((row) => {
    const query = search.toLowerCase()
    return (!query || `${row.race_id} ${row.state} ${row.dem_candidate} ${row.rep_candidate}`.toLowerCase().includes(query)) && (!rating || row.race_rating === rating) && (!primary || row.primary_status === primary) && (!womenOnly || Boolean(row.dem_woman || row.rep_woman))
  }).sort((a, b) => {
    const raceA = office === 'house' ? a.race_id : a.state; const raceB = office === 'house' ? b.race_id : b.state
    const value = (row: RaceRow): string | number => sort === 'race' ? (office === 'house' ? row.race_id : row.state) : sort === 'race_rating' ? ratingOrder.indexOf(row.race_rating) : row[sort]
    const result = typeof value(a) === 'number' ? Number(value(a)) - Number(value(b)) : String(value(a)).localeCompare(String(value(b)))
    return (result || raceA.localeCompare(raceB)) * (direction === 'asc' ? 1 : -1)
  }), [rows, search, rating, primary, womenOnly, sort, direction, office])

  function changeSort(key: SortKey) { if (sort === key) setDirection(direction === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDirection('asc') } }
  const SortButton = ({ column, children }: { column: SortKey, children: React.ReactNode }) => <button className="sort" onClick={() => changeSort(column)} aria-label={`Sort by ${children}`}>{children}<span aria-hidden="true">{sort === column ? direction === 'asc' ? ' ↑' : ' ↓' : ' ↕'}</span></button>

  return <section className="races"><div className="section-heading compact"><div><p className="eyebrow">RACE BY RACE</p><h2>The full field</h2></div><button className="download" onClick={() => csvDownload(filtered)}>Download filtered CSV <span aria-hidden="true">↓</span></button></div>
    <div className="filters"><label className="search"><span>Search races and candidates</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by race or candidate…" /></label><label><span>Rating</span><select value={rating} onChange={(e) => setRating(e.target.value)}><option value="">All ratings</option>{ratingOrder.filter((item) => rows.some((row) => row.race_rating === item)).map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Primary status</span><select value={primary} onChange={(e) => setPrimary(e.target.value)}><option value="">All statuses</option>{primaryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={womenOnly} onChange={(e) => setWomenOnly(e.target.checked)} /><span>At least one woman</span></label></div>
    <p className="result-count">Showing <strong>{filtered.length}</strong> of {rows.length} races</p>
    <div className="table-scroll"><table><thead><tr><th><SortButton column="race">{raceLabel}</SortButton></th><th><SortButton column="primary_status">Primary status</SortButton></th><th><SortButton column="dem_candidate">Democratic candidate</SortButton></th><th><SortButton column="rep_candidate">Republican candidate</SortButton></th><th><SortButton column="race_rating">Rating</SortButton></th><th className="numeric"><SortButton column="expected_woman">Expected woman</SortButton></th></tr></thead><tbody>{filtered.map((row) => <tr key={row.race_id}><td className="race-name"><strong>{office === 'house' ? row.race_id : row.state}</strong></td><td>{row.primary_status}</td><td><span className="candidate"><i className="party-line blue" />{row.dem_candidate || 'Unresolved'}</span>{Boolean(row.dem_woman) && <span className="woman-badge">Woman</span>}</td><td><span className="candidate"><i className="party-line red" />{row.rep_candidate || 'Unresolved'}</span>{Boolean(row.rep_woman) && <span className="woman-badge">Woman</span>}</td><td><span className={`rating-pill ${ratingClass(row.race_rating)}`}>{row.race_rating}</span></td><td className="numeric expected">{row.expected_woman.toFixed(3)}</td></tr>)}</tbody></table></div>
    {!filtered.length && <p className="empty">No races match these filters.</p>}
  </section>
}

export default App
