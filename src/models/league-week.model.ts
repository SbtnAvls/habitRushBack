export interface LeagueWeek {
  id: number;
  week_start: Date;
}

export interface League {
  id: number;
  name: string;
  color_hex: string;
  level: number;
}

// Liga IDs constantes
export const LEAGUE_IDS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  DIAMOND: 4,
  MASTER: 5,
} as const;

export const COMPETITORS_PER_LEAGUE = 20;
