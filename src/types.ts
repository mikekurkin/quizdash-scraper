export interface City {
  _id: number;
  name: string;
  slug: string;
  timezone: string;
  last_game_id?: number;
}

export interface Series {
  _id: string;
  name: string;
  slug: string;
}

export interface Game {
  _id: number;
  city_id: number;
  series_id: string;
  number: string;
  date: Date;
  price: number;
  location: string;
  address?: string;
  is_stream: boolean;
  processed?: boolean;
}

export interface GameResult {
  _id: string;
  game_id: number;
  team_id: string;
  rounds: number[];
  sum: number;
  place: number;
  rank_id?: string;
  has_errors: boolean;
}

export interface Team {
  _id: string;
  city_id: number;
  name: string;
  slug: string;
  previous_team_id?: string;
  inconsistent_rank: boolean;
}

export interface RankMapping {
  _id: string;
  name: string;
  image_urls: string[];
}
