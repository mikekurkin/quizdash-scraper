export function normalizeText(text: string): string {
  return text
    .replace(/[""]/g, '"')
    .replace(/[''′‵]/g, "'")
    .replace(/[…⋯⋮⋰⋱]/g, '...')
    .replace(/[‒–—―−]/g, '-')
    .replace(/[«»‹›『』「」]/g, '"')
    .replace(/[·•●]/g, '.')
    .replace(/[‚„]/g, ',')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
