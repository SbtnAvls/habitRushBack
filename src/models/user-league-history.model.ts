export interface UserLeagueHistory {
  id: string;
  user_id: string;
  league_id: number;
  league_week_id: number;
  weekly_xp: number;
  position: number | null;
  change_type: 'promoted' | 'relegated' | 'stayed';
  created_at: string;
}
