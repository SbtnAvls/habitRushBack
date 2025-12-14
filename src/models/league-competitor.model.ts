export interface LeagueCompetitor {
  id: string;
  league_week_id: number;
  league_id: number;
  user_id: string | null;
  name: string;
  weekly_xp: number;
  position: number;
  is_real: boolean;
  created_at: string;
}
