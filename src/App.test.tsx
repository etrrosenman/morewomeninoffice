import { render, screen } from '@testing-library/react'
import App from './App'

beforeEach(() => { global.fetch = vi.fn(() => new Promise(() => undefined)) as unknown as typeof fetch })
test('renders the site heading and accessible office tabs', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /how many women/i })).toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  expect(screen.getByRole('tab', { name: 'House' })).toHaveAttribute('aria-selected', 'true')
})
