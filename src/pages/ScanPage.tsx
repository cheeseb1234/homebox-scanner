import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { ScannerInput } from '../components/ScannerInput';
import { StatusBanner } from '../components/StatusBanner';
import { CameraScanButton } from '../components/CameraScanButton';
import { EntityCard } from '../components/EntityCard';
import { playErrorTone, playSuccessTone } from '../lib/audio';
import { resolveScan } from '../lib/homebox/scanResolver';
import { filterLocationsByTerm } from '../lib/homebox/helpers';
import { useSession } from '../state/session';
import type { EntitySummary, ItemSummary, LocationSummary } from '../types/homebox';

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[#"']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchTokens(value: string): string[] {
  return normalizeSearchText(value).split(/\s+/).filter((token) => token.length >= 2);
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

function fuzzyIncludes(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedNeedle = normalizeSearchText(needle);
  if (!normalizedHaystack || !normalizedNeedle) return false;

  if (normalizedHaystack.includes(normalizedNeedle)) return true;
  if (compactSearchText(normalizedHaystack).includes(compactSearchText(normalizedNeedle))) return true;

  const tokens = searchTokens(normalizedNeedle);
  return tokens.length > 0 && tokens.every((token) => normalizedHaystack.includes(token));
}

function scoreItemSearchResult(item: ItemSummary, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  const tokens = searchTokens(rawQuery);
  const searchable = normalizeSearchText([
    item.name,
    item.assetId,
    item.description,
    ...(item.tags || []).map((tag) => tag.name)
  ].filter(Boolean).join(' '));

  let score = 0;
  if (normalizeSearchText(item.name) === query) score += 120;
  if (fuzzyIncludes(item.name, rawQuery)) score += 80;
  if (item.assetId && fuzzyIncludes(item.assetId, rawQuery)) score += 70;
  if ((item.tags || []).some((tag) => fuzzyIncludes(tag.name, rawQuery))) score += 55;
  score += tokens.filter((token) => searchable.includes(token)).length * 12;
  return score;
}

function scoreLocationSearchResult(location: LocationSummary, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  const tokens = searchTokens(rawQuery);
  const searchable = normalizeSearchText([location.name, location.description].filter(Boolean).join(' '));

  let score = 0;
  if (normalizeSearchText(location.name) === query) score += 120;
  if (fuzzyIncludes(location.name, rawQuery)) score += 85;
  score += tokens.filter((token) => searchable.includes(token)).length * 12;
  return score;
}

function sortAndLimitResults(results: EntitySummary[], rawQuery: string): EntitySummary[] {
  return Array.from(new Map(results.map((result) => [result.id, result])).values())
    .map((entity) => ({
      entity,
      score: entity.kind === 'location'
        ? scoreLocationSearchResult(entity, rawQuery)
        : scoreItemSearchResult(entity, rawQuery)
    }))
    .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name))
    .map(({ entity }) => entity)
    .slice(0, 40);
}

export function ScanPage(): JSX.Element {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();
  const [results, setResults] = useState<EntitySummary[]>([]);
  const [resultSubtitles, setResultSubtitles] = useState<Record<string, string>>({});
  const [missingSearchTerm, setMissingSearchTerm] = useState('');

  const createLocationMutation = useMutation({
    mutationFn: async (name: string) => api.createLocation({ name }),
    onSuccess: async (created) => {
      playSuccessTone();
      setMissingSearchTerm('');
      setResults([created]);
      await queryClient.invalidateQueries({ queryKey: ['locations-tree'] });
      setMessage({ tone: 'success', text: `Created location: ${created.name}` });
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Unable to create location.' });
    }
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => api.createTag({ name }),
    onSuccess: async (created) => {
      playSuccessTone();
      setMissingSearchTerm('');
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
      setMessage({ tone: 'success', text: `Created tag: ${created.name}` });
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Unable to create tag.' });
    }
  });

  async function searchEverything(value: string): Promise<void> {
    try {
      const searchTerm = value.trim();
      if (!searchTerm) return;
      setMissingSearchTerm('');

      const allResults: EntitySummary[] = [];
      const resolved = await resolveScan(api, searchTerm).catch(() => null);

      if (resolved?.kind === 'item' || resolved?.kind === 'location') {
        allResults.push(resolved.entity);
      } else if (resolved?.kind === 'ambiguous') {
        allResults.push(...resolved.matches);
      }

      const tokens = searchTokens(searchTerm);
      const queryVariants = Array.from(new Set([
        searchTerm,
        normalizeSearchText(searchTerm),
        compactSearchText(searchTerm),
        ...tokens
      ].map((query) => query.trim()).filter((query) => query.length >= 2)));

      for (const query of queryVariants) {
        const itemResult = await api.searchItems({ q: query, pageSize: 30 });
        allResults.push(...itemResult.items);
      }

      const tags = await api.getTags();
      const matchingTagIds = tags
        .filter((tag) => fuzzyIncludes(tag.name, searchTerm) || tokens.some((token) => fuzzyIncludes(tag.name, token)))
        .map((tag) => tag.id);

      if (matchingTagIds.length) {
        const taggedItems = await api.searchItems({ tags: matchingTagIds, pageSize: 30 });
        allResults.push(...taggedItems.items);
      }

      const locations = filterLocationsByTerm(await api.getLocations(), searchTerm)
        .filter((location) => fuzzyIncludes(location.name, searchTerm) || tokens.some((token) => fuzzyIncludes(location.name, token)));
      allResults.push(...locations);

      const sortedResults = sortAndLimitResults(allResults, searchTerm);
      const subtitles: Record<string, string> = {};

      await Promise.all(sortedResults.map(async (entity) => {
        try {
          if (entity.kind === 'location') {
            const path = await api.getLocationPath(entity.id);
            if (path.length > 1) {
              subtitles[entity.id] = path.map((part) => part.name).join(' - ');
            }
            return;
          }

          const path = await api.getItemPath(entity.id);
          const locationPath = path.filter((part) => part.type === 'location');
          if (locationPath.length) {
            subtitles[entity.id] = locationPath.map((part) => part.name).join(' - ');
          } else if (entity.location?.name) {
            subtitles[entity.id] = entity.location.name;
          }
        } catch {
          // Breadcrumbs are helpful context, not required for search results.
        }
      }));

      setResultSubtitles(subtitles);
      setResults(sortedResults);

      if (sortedResults.length) {
        playSuccessTone();
        setMessage({ tone: 'success', text: `Found ${sortedResults.length} result(s). Select one to continue.` });
      } else {
        playErrorTone();
        setMissingSearchTerm(searchTerm);
        setMessage({ tone: 'info', text: `No item, location, or tag matched “${searchTerm}”. Create a location or tag?` });
      }
    } catch (caught) {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to search HomeBox'
      });
    }
  }

  return (
    <Layout title="Scan / Search">
      <div className="hero-card simple-hero-card">
        <div>
          <div className="eyebrow">Universal lookup</div>
          <p className="hero-copy">
            Scan a label or search for an item, asset, tag, or location. Select a result to open its action page.
          </p>
        </div>
      </div>

      {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}

      <ScannerInput
        label="Scan or search"
        placeholder="Item, asset, tag, or location"
        helperText="Results can be items or locations. Item pages include Move, Adjust Quantity, Quick Create, and Open in HomeBox."
        onSubmit={searchEverything}
        cameraButton={<CameraScanButton onDetected={(value) => void searchEverything(value)} />}
      />

      {missingSearchTerm ? (
        <div className="card">
          <div className="section-title">Create from scan?</div>
          <div className="helper-text">No existing item, location, or tag matched “{missingSearchTerm}”.</div>
          <div className="action-row wrap">
            <button type="button" className="primary-button" onClick={() => createLocationMutation.mutate(missingSearchTerm)} disabled={createLocationMutation.isPending || createTagMutation.isPending}>
              {createLocationMutation.isPending ? 'Creating…' : `Create location “${missingSearchTerm}”`}
            </button>
            <button type="button" className="secondary-button" onClick={() => createTagMutation.mutate(missingSearchTerm)} disabled={createLocationMutation.isPending || createTagMutation.isPending}>
              {createTagMutation.isPending ? 'Creating…' : `Create tag “${missingSearchTerm}”`}
            </button>
            <button type="button" className="secondary-button" onClick={() => setMissingSearchTerm('')}>Dismiss</button>
          </div>
        </div>
      ) : null}

      <section className="field-section">
        <div className="section-heading-row">
          <div>
            <div className="eyebrow">Results</div>
            <div className="section-title">Select one to continue</div>
          </div>
          {results.length ? <span className="helper-text">{results.length} shown</span> : null}
        </div>

        <div className="stack compact-stack">
          {results.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              subtitle={resultSubtitles[entity.id]}
              to={entity.kind === 'location' ? `/location/${entity.id}` : `/item/${entity.id}`}
            />
          ))}
        </div>
      </section>
    </Layout>
  );
}
