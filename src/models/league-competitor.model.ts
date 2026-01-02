export type BotProfileType = 'lazy' | 'casual' | 'active' | 'hardcore';

export interface LeagueCompetitor {
  id: string;
  league_week_id: number;
  league_id: number;
  league_group: number;
  user_id: string | null;
  name: string;
  weekly_xp: number;
  position: number;
  is_real: boolean;
  bot_profile: BotProfileType | null; // Only for bots (is_real = false)
  created_at: string;
}
