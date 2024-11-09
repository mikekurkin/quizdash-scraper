import slugify from 'slugify';
import type { Storage } from '../storage/interface';

export function generateSlug(name: string): string {
  const preprocessed = name
    .toLowerCase()
    .replace(/квиз/g, 'quiz')
    .replace(/плиз/g, 'please')
    .replace(/1\?=!/g, 'one-question-is-fine')
    .replace(/¯\\_(ツ)_\/¯/g, ' shrug ')
    .replace(/\.\*/g, ' wildcard ')
    .replace(/\*/g, ' star ');

  slugify.extend({ '+': ' plus ' });

  return slugify(preprocessed, {
    lower: true,
    strict: true,
    trim: true,
    locale: 'en',
  });
}

export async function generateUniqueTeamSlug(baseName: string, cityId: number, storage: Storage): Promise<string> {
  let slug = generateSlug(baseName);
  let counter = 1;

  // Keep checking until we find a unique slug
  while (true) {
    const existingTeam = await storage.findTeamBySlugAndCity(slug, cityId);
    if (!existingTeam) {
      return slug;
    }
    // If slug exists, append counter and try again
    slug = `${generateSlug(baseName)}-${counter}`;
    counter++;
  }
}
