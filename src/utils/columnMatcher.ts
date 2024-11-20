export interface ColumnMatcher {
  findColumn: (text: string) => boolean;
  variants: string[];
}

export const columnMatchers = {
  team: {
    variants: [
      "название команды",
      "команда",
      "название команд",
      "team",
      "название",
      "нахвание",
      "навание",
      "названия команд",
    ],
    findColumn: (text: string): boolean =>
      columnMatchers.team.variants.some((variant) =>
        text.toLowerCase().includes(variant.toLowerCase())
      ),
  },

  round: {
    variants: [
      "раунд",
      "round",
      "тур",
      "блок",
      "tour",
      " – ",
      "1-20",
      "21-40",
      "41-50",
    ],
    findColumn: (text: string): boolean =>
      columnMatchers.round.variants.some((variant) =>
        text.toLowerCase().includes(variant.toLowerCase())
      ),
  },

  total: {
    variants: ["итого", "сумма", "total", "всего", "результат", "итог"],
    findColumn: (text: string): boolean =>
      columnMatchers.total.variants.some((variant) =>
        text.toLowerCase().includes(variant.toLowerCase())
      ),
  },

  team_city: {
    variants: ["город", "city"],
    findColumn: (text: string): boolean =>
      columnMatchers.team_city.variants.some((variant) =>
        text.toLowerCase().includes(variant.toLowerCase())
      ),
  },

  place: {
    variants: ["место", "place", "position", "позиция"],
    findColumn: (text: string): boolean =>
      columnMatchers.place.variants.some((variant) =>
        text.toLowerCase().includes(variant.toLowerCase())
      ),
  },

  rank: {
    variants: ["ранг", "rank", "уровень", "level"],
    findColumn: (text: string): boolean =>
      columnMatchers.rank.variants.some((variant) =>
        text.toLowerCase().includes(variant.toLowerCase())
      ),
  },
};
