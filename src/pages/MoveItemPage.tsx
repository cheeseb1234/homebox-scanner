import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { ScannerInput } from '../components/ScannerInput';
import { StatusBanner } from '../components/StatusBanner';
import { CameraScanButton } from '../components/CameraScanButton';
import { playErrorTone, playSuccessTone } from '../lib/audio';
import { resolveScan } from '../lib/homebox/scanResolver';
import { filterLocationsByTerm } from '../lib/homebox/helpers';
import { useSession } from '../state/session';
import type { LocationOut, LocationSummary } from '../types/homebox';

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

function sortAndLimitLocations(results: LocationSummary[], rawQuery: string): LocationSummary[] {
  return Array.from(new Map(results.map((result) => [result.id, result])).values())
    .map((location) => ({
      location,
      score: scoreLocationSearchResult(location, rawQuery)
    }))
    .sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name))
    .map(({ location }) => location)
    .slice(0, 40);
}

export function MoveItemPage(): JSX.Element {
  const { entityId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { api } = useSession();
  const [destination, setDestination] = useState<LocationOut | null>(null);
  const [destinationResults, setDestinationResults] = useState<LocationSummary[]>([]);
  const [missingDestinationName, setMissingDestinationName] = useState('');
  const [resultSubtitles, setResultSubtitles] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();

  const itemQuery = useQuery({
    queryKey: ['item', entityId],
    queryFn: () => api.getItem(entityId)
  });

  const createDestinationMutation = useMutation({
    mutationFn: async (name: string) => api.createLocation({ name }),
    onSuccess: async (created) => {
      playSuccessTone();
      setMissingDestinationName('');
      setDestinationResults([]);
      await queryClient.invalidateQueries({ queryKey: ['locations-tree'] });
      await selectDestination(created.id);
      setMessage({ tone: 'success', text: `Created and selected destination: ${created.name}` });
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Unable to create destination.' });
    }
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!destination) throw new Error('Scan or select a destination first.');
      return api.patchItem(entityId, { locationId: destination.id });
    },
    onSuccess: async () => {
      playSuccessTone();
      await queryClient.invalidateQueries({ queryKey: ['item', entityId] });
      await queryClient.invalidateQueries({ queryKey: ['item-path', entityId] });
      setMessage({ tone: 'success', text: 'Item moved successfully.' });
      navigate(`/item/${entityId}`);
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to move item'
      });
    }
  });

  async function selectDestination(locationId: string): Promise<void> {
    try {
      const entity = await api.getLocation(locationId);
      setDestination(entity);
      setMissingDestinationName('');
      playSuccessTone();
      setMessage({ tone: 'success', text: `Destination set to ${entity.name}` });
    } catch (caught) {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to select destination'
      });
    }
  }

  async function searchDestination(value: string): Promise<void> {
    try {
      const searchTerm = value.trim();
      if (!searchTerm) return;

      const allResults: LocationSummary[] = [];
      setMissingDestinationName('');
      const resolved = await resolveScan(api, searchTerm).catch(() => null);

      if (resolved?.kind === 'location') {
        allResults.push(resolved.entity);
      } else if (resolved?.kind === 'item' && resolved.entity.location) {
        allResults.push(resolved.entity.location);
      } else if (resolved?.kind === 'ambiguous') {
        allResults.push(...resolved.matches.filter((match): match is LocationSummary => match.kind === 'location'));
      }

      const tokens = searchTokens(searchTerm);
      const locations = filterLocationsByTerm(await api.getLocations(), searchTerm)
        .filter((location) => fuzzyIncludes(location.name, searchTerm) || tokens.some((token) => fuzzyIncludes(location.name, token)));
      allResults.push(...locations);

      const sortedResults = sortAndLimitLocations(allResults, searchTerm);
      const subtitles: Record<string, string> = {};

      await Promise.all(sortedResults.map(async (location) => {
        try {
          const path = await api.getLocationPath(location.id);
          if (path.length > 1) {
            subtitles[location.id] = path.map((part) => part.name).join(' - ');
          }
        } catch {
          // Breadcrumbs are helpful context, not required for destination selection.
        }
      }));

      setResultSubtitles(subtitles);
      setDestinationResults(sortedResults);

      if (sortedResults.length === 1) {
        await selectDestination(sortedResults[0].id);
        return;
      }

      if (sortedResults.length) {
        playSuccessTone();
        setMessage({ tone: 'success', text: `Found ${sortedResults.length} destination(s). Select one, then confirm.` });
      } else {
        playErrorTone();
        setMissingDestinationName(searchTerm);
        setMessage({ tone: 'info', text: `No destination named “${searchTerm}” found. Create it?` });
      }
    } catch (caught) {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to search destinations'
      });
    }
  }

  return (
    <Layout title="Move Item">
      {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}

      <div className="card">
        <div className="section-title">Current item</div>
        {itemQuery.data ? (
          <>
            <div className="entity-name">{itemQuery.data.name}</div>
            <div className="subtle-text">{itemQuery.data.location?.name || 'No current location'}</div>
          </>
        ) : (
          <div>Loading item…</div>
        )}
      </div>

      <ScannerInput
        label="Destination Location"
        placeholder="Scan or search destination"
        helperText="Search works like universal lookup: scan/search a location name, duplicate room name, or an item already in the target location."
        onSubmit={searchDestination}
        cameraButton={<CameraScanButton onDetected={(value) => void searchDestination(value)} />}
      />

      {missingDestinationName ? (
        <div className="card">
          <div className="section-title">Create missing destination?</div>
          <div className="helper-text">No destination location matched “{missingDestinationName}”.</div>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => createDestinationMutation.mutate(missingDestinationName)} disabled={createDestinationMutation.isPending}>
              {createDestinationMutation.isPending ? 'Creating…' : `Create “${missingDestinationName}”`}
            </button>
            <button type="button" className="secondary-button" onClick={() => setMissingDestinationName('')}>Dismiss</button>
          </div>
        </div>
      ) : null}

      {destinationResults.length ? (
        <section className="field-section">
          <div className="section-heading-row">
            <div>
              <div className="eyebrow">Destination results</div>
              <div className="section-title">Tap a location to select it</div>
            </div>
            <span className="helper-text">{destinationResults.length} shown</span>
          </div>

          <div className="stack compact-stack">
            {destinationResults.map((location) => (
              <button
                key={location.id}
                className="card entity-card destination-result-card"
                type="button"
                onClick={() => void selectDestination(location.id)}
              >
                <div className="entity-card-title">{location.name}</div>
                <div className="subtle-text">
                  Location
                  {location.itemCount !== undefined ? ` • ${location.itemCount} item(s)` : ''}
                </div>
                {resultSubtitles[location.id] ? <div className="helper-text">{resultSubtitles[location.id]}</div> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {destination ? (
        <div className="card">
          <div className="section-title">Destination</div>
          <div className="entity-name">{destination.name}</div>
          <div className="subtle-text">{resultSubtitles[destination.id] || 'Location selected'}</div>
        </div>
      ) : null}

      <div className="action-row">
        <button className="primary-button" type="button" onClick={() => moveMutation.mutate()} disabled={!destination || moveMutation.isPending}>
          {moveMutation.isPending ? 'Moving…' : 'Confirm Transfer'}
        </button>
        <Link className="secondary-button" to={`/item/${entityId}`}>Cancel</Link>
      </div>
    </Layout>
  );
}
