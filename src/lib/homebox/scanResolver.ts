import type { EntitySummary, ItemSummary, LocationOut, LocationSummary } from '../../types/homebox';
import type { HomeboxApi } from './api';
import { filterLocationsByTerm } from './helpers';

export type ScanResolved =
  | { kind: 'item'; entity: import('../../types/homebox').ItemOut }
  | { kind: 'location'; entity: LocationOut }
  | { kind: 'ambiguous'; matches: EntitySummary[]; raw: string }
  | { kind: 'unknown'; raw: string; reason: string };

function normalize(input: string): string {
  return input.trim().replace(/\r?\n/g, '').trim();
}

function parseCustomCode(value: string): { type: 'item' | 'location'; id: string } | null {
  const match = /^HBX:(ITEM|LOC):(.+)$/i.exec(value);
  if (!match) return null;
  return {
    type: match[1].toUpperCase() === 'ITEM' ? 'item' : 'location',
    id: match[2]
  };
}

function tokenLooksUseful(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{2,}$/.test(value) && !/^(items?|locations?|tags?|qrcode|api|v1)$/i.test(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseUrlishEntity(value: string): { candidates: string[]; hintedType?: 'item' | 'location' } | null {
  try {
    const url = new URL(value);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const hashSegments = url.hash.replace(/^#/, '').split(/[/?]/).filter(Boolean);
    const allSegments = [...pathSegments, ...hashSegments];

    const hintedType = allSegments.some((segment) => /location/i.test(segment)) || allSegments.some((segment) => /^l$/i.test(segment))
      ? 'location'
      : allSegments.some((segment) => /item/i.test(segment)) || allSegments.some((segment) => /^a$/i.test(segment)) || allSegments.some((segment) => /^i$/i.test(segment))
        ? 'item'
        : undefined;

    const candidates: string[] = [];

    for (const key of ['id', 'itemId', 'locationId', 'assetId', 'asset']) {
      const valueFromQuery = url.searchParams.get(key);
      if (valueFromQuery && tokenLooksUseful(valueFromQuery)) candidates.push(valueFromQuery);
    }

    for (let i = 0; i < allSegments.length; i += 1) {
      const segment = allSegments[i];
      const next = allSegments[i + 1];
      if (/^(item|items|asset|assets|a|i|location|locations|l)$/i.test(segment) && next && tokenLooksUseful(next)) {
        candidates.push(next);
      }
      if (tokenLooksUseful(segment)) candidates.push(segment);
    }

    const cleaned = unique(candidates);
    if (!cleaned.length) return null;

    return {
      candidates: cleaned,
      hintedType
    };
  } catch {
    return null;
  }
}

async function tryGetItem(api: HomeboxApi, id: string): Promise<import('../../types/homebox').ItemOut | null> {
  try {
    return await api.getItem(id);
  } catch {
    return null;
  }
}

async function tryGetLocation(api: HomeboxApi, id: string): Promise<LocationOut | null> {
  try {
    return await api.getLocation(id);
  } catch {
    return null;
  }
}

async function resolveDirectIdentifier(
  api: HomeboxApi,
  token: string,
  hintedType?: 'item' | 'location'
): Promise<ScanResolved | null> {
  if (!tokenLooksUseful(token)) return null;

  if (hintedType === 'location') {
    const location = await tryGetLocation(api, token);
    if (location) return { kind: 'location', entity: location };
  }

  if (hintedType === 'item') {
    const item = await tryGetItem(api, token);
    if (item) return { kind: 'item', entity: item };
  }

  const item = await tryGetItem(api, token);
  if (item) return { kind: 'item', entity: item };

  const location = await tryGetLocation(api, token);
  if (location) return { kind: 'location', entity: location };

  return null;
}

async function trySearchToken(api: HomeboxApi, token: string): Promise<ScanResolved | null> {
  if (!tokenLooksUseful(token)) return null;

  try {
    const assetMatches = await api.lookupByAssetId(token);
    if (assetMatches.total === 1 && assetMatches.items[0]) {
      const entity = await api.getItem(assetMatches.items[0].id);
      return { kind: 'item', entity };
    }

    if (assetMatches.total > 1) {
      return {
        kind: 'ambiguous',
        matches: assetMatches.items,
        raw: token
      };
    }
  } catch {
    // continue to search fallback
  }

  try {
    const itemMatches = await api.searchItems({ q: token, pageSize: 10 });
    if (itemMatches.total === 1 && itemMatches.items[0]) {
      const entity = await api.getItem(itemMatches.items[0].id);
      return { kind: 'item', entity };
    }

    const locationMatches = filterLocationsByTerm(await api.getLocations(), token);

    if (itemMatches.total === 0 && locationMatches.length === 1) {
      const entity = await api.getLocation(locationMatches[0].id);
      return { kind: 'location', entity };
    }

    const combined: EntitySummary[] = [...itemMatches.items, ...locationMatches];
    if (combined.length > 1) {
      return {
        kind: 'ambiguous',
        matches: combined,
        raw: token
      };
    }
  } catch {
    // continue to unknown
  }

  return null;
}

export async function resolveScan(api: HomeboxApi, rawScan: string): Promise<ScanResolved> {
  const value = normalize(rawScan);
  if (!value) {
    return {
      kind: 'unknown',
      raw: rawScan,
      reason: 'Empty scan'
    };
  }

  const custom = parseCustomCode(value);
  if (custom) {
    if (custom.type === 'location') {
      const entity = await api.getLocation(custom.id);
      return { kind: 'location', entity };
    }

    const entity = await api.getItem(custom.id);
    return { kind: 'item', entity };
  }

  const urlish = parseUrlishEntity(value);
  if (urlish) {
    for (const candidate of urlish.candidates) {
      const direct = await resolveDirectIdentifier(api, candidate, urlish.hintedType);
      if (direct) return direct;
    }

    for (const candidate of urlish.candidates) {
      const resolved = await trySearchToken(api, candidate);
      if (resolved) return resolved;
    }
  }

  const direct = await resolveDirectIdentifier(api, value);
  if (direct) return direct;

  const search = await trySearchToken(api, value);
  if (search) return search;

  return {
    kind: 'unknown',
    raw: value,
    reason: 'No HomeBox entity matched this scan.'
  };
}
