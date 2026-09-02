import { render, screen } from '@testing-library/react'
import App from './App'
import { matchesRaceSearch } from './race'
import type { RaceRow } from './types'

beforeEach(() => { global.fetch = vi.fn(() => new Promise(() => undefined)) as unknown as typeof fetch })
test('renders the site heading and accessible office tabs', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /how many women/i })).toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(4)
  const tabs = screen.getAllByRole('tab')
  expect(tabs.map((tab) => tab.textContent)).toEqual(['House', 'Senate', 'Governors', 'REPRESENTATION OVER TIME'])
  expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
})

test('matches House district searches with padded or unpadded numbers', () => {
  const row = {
    race_id: 'MI-1', state: 'Michigan', dem_candidate: 'Jane Doe', rep_candidate: 'John Doe',
  } as RaceRow

  expect(matchesRaceSearch(row, 'MI-01', 'house')).toBe(true)
  expect(matchesRaceSearch(row, 'MI-1', 'house')).toBe(true)
})
