export type Office = 'house' | 'governor' | 'senate'

export interface RaceRow {
  snapshot_date: string
  office: string
  race_id: string
  state: string
  primary_status: string
  dem_candidate: string
  dem_woman: number
  dem_gender_basis: string
  rep_candidate: string
  rep_woman: number
  rep_gender_basis: string
  race_rating: string
  dem_win_probability: number
  rep_win_probability: number
  expected_woman: number
  notes: string
  candidate_source: string
  rating_source: string
  gender_source: string
  not_up_women_baseline: number
}

export interface Summary {
  expectedElected: number
  baseline: number
  total: number
  democratic: number
  republican: number
  racesWithWomen: number
  democraticWomen: number
  republicanWomen: number
}
