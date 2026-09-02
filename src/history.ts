import type { Office } from './types'

export type HistoryPoint = {
  year: number
  office: Office
  percent: number
  kind: 'historical' | 'projection'
}

export const officeDenominators: Record<Office, number> = {
  house: 435,
  senate: 100,
  governor: 50,
}

export const historySources = [
  { label: 'CAWP current Congress', url: 'https://cawp.rutgers.edu/facts/levels-office/congress/women-us-congress-2025' },
  { label: 'CAWP women officeholders', url: 'https://cawp.rutgers.edu/facts/current-numbers/women-elective-office-2024' },
  { label: 'Pew House series', url: 'https://www.pewresearch.org/chart/women-in-the-us-house/' },
  { label: 'Pew Senate series', url: 'https://www.pewresearch.org/chart/women-in-the-us-senate/' },
  { label: 'Pew governors series', url: 'https://www.pewresearch.org/chart/women-us-governors/' },
]

const house: [number, number][] = [
  [1981, 4.1], [1983, 4.8], [1985, 5.1], [1987, 5.3], [1989, 5.7], [1991, 6.4],
  [1993, 10.8], [1995, 10.8], [1997, 11.7], [1999, 12.9], [2001, 13.6], [2003, 13.6],
  [2005, 14.9], [2007, 16.3], [2009, 17.0], [2011, 16.6], [2013, 17.9], [2015, 19.3],
  [2017, 19.1], [2019, 23.4], [2021, 27.3], [2023, 28.5], [2025, 28.5],
]

const senate: [number, number][] = [
  [1981, 2], [1983, 2], [1985, 2], [1987, 2], [1989, 2], [1991, 2],
  [1993, 6], [1995, 9], [1997, 9], [1999, 9], [2001, 12], [2003, 14],
  [2005, 14], [2007, 16], [2009, 17], [2011, 17], [2013, 20], [2015, 20],
  [2017, 21], [2019, 25], [2021, 26], [2023, 25], [2025, 26],
]

const governor: [number, number][] = [
  [1980, 4], [1981, 0], [1982, 0], [1983, 0], [1984, 2], [1985, 4], [1986, 4],
  [1987, 6], [1988, 6], [1989, 6], [1990, 6], [1991, 6], [1992, 6], [1993, 6],
  [1994, 8], [1995, 2], [1996, 2], [1997, 4], [1998, 6], [1999, 6], [2000, 6],
  [2001, 10], [2002, 10], [2003, 12], [2004, 18], [2005, 16], [2006, 16],
  [2007, 18], [2008, 16], [2009, 14], [2010, 12], [2011, 12], [2012, 12],
  [2013, 10], [2014, 10], [2015, 10], [2016, 12], [2017, 12], [2018, 12],
  [2019, 18], [2020, 18], [2021, 18], [2022, 18], [2023, 24], [2024, 24],
  [2025, 24],
]

export const historicalRepresentation: HistoryPoint[] = [
  ...house.map(([year, percent]) => ({ year, office: 'house' as const, percent, kind: 'historical' as const })),
  ...senate.map(([year, percent]) => ({ year, office: 'senate' as const, percent, kind: 'historical' as const })),
  ...governor.map(([year, percent]) => ({ year, office: 'governor' as const, percent, kind: 'historical' as const })),
]
