import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { StatusBanner } from '../components/StatusBanner';
import { ScannerInput } from '../components/ScannerInput';
import { CameraScanButton } from '../components/CameraScanButton';
import { TagPill } from '../components/TagPill';
import { playErrorTone, playSuccessTone } from '../lib/audio';
import { ensureTagIds, buildItemUpdateFromItem } from '../lib/homebox/helpers';
import { resolveScan } from '../lib/homebox/scanResolver';
import { useSession } from '../state/session';
import type { LocationOut, LocationSummary, TagSummary } from '../types/homebox';

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function searchTokens(value: string): string[] {
  return normalizeSearchText(value).split(/\s+/).filter((token) => token.length >= 2);
}

function fuzzyIncludes(haystack: string | undefined, needle: string): boolean {
  const normalizedHaystack = normalizeSearchText(haystack || '');
  const normalizedNeedle = normalizeSearchText(needle);
  if (!normalizedNeedle) return true;
  if (normalizedHaystack.includes(normalizedNeedle)) return true;
  const tokens = searchTokens(normalizedNeedle);
  return tokens.length > 0 && tokens.every((token) => normalizedHaystack.includes(token));
}

function locationScore(location: LocationSummary, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  const tokens = searchTokens(rawQuery);
  const name = normalizeSearchText(location.name);
  const searchable = normalizeSearchText([location.name, location.description].filter(Boolean).join(' '));
  let score = 0;
  if (name === query) score += 100;
  if (name.startsWith(query)) score += 45;
  if (searchable.includes(query)) score += 25;
  score += tokens.filter((token) => searchable.includes(token)).length * 12;
  score += Math.max(0, 10 - name.length / 12);
  return score;
}

function tagScore(tag: TagSummary, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  const tokens = searchTokens(rawQuery);
  const name = normalizeSearchText(tag.name);
  const searchable = normalizeSearchText([tag.name, tag.description].filter(Boolean).join(' '));
  let score = 0;
  if (name === query) score += 100;
  if (name.startsWith(query)) score += 45;
  if (searchable.includes(query)) score += 25;
  score += tokens.filter((token) => searchable.includes(token)).length * 12;
  score += Math.max(0, 10 - name.length / 12);
  return score;
}

async function getLocationSubtitle(api: ReturnType<typeof useSession>['api'], locationId: string): Promise<string | undefined> {
  try {
    const path = await api.getLocationPath(locationId);
    return path.length ? path.map((part) => part.name).join(' / ') : undefined;
  } catch {
    return undefined;
  }
}

export function QuickCreatePage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { api } = useSession();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState<Array<{ location: LocationSummary; subtitle?: string }>>([]);
  const [missingLocationName, setMissingLocationName] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<TagSummary[]>([]);
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState<LocationOut | LocationSummary | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.getTags()
  });

  const createLocationMutation = useMutation({
    mutationFn: async (locationName: string) => api.createLocation({ name: locationName }),
    onSuccess: async (created) => {
      playSuccessTone();
      setLocation(created);
      setMissingLocationName('');
      setLocationResults([]);
      setLocationSearch('');
      await queryClient.invalidateQueries({ queryKey: ['locations-tree'] });
      setMessage({ tone: 'success', text: `Created and selected location: ${created.name}` });
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Unable to create location.' });
    }
  });

  const tagResults = useMemo(() => {
    const query = tagSearch.trim();
    const selectedIds = new Set(selectedTags.map((tag) => tag.id));
    const available = (tagsQuery.data ?? []).filter((tag) => !selectedIds.has(tag.id));
    if (!query) return available.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
    return available
      .filter((tag) => fuzzyIncludes(tag.name, query) || fuzzyIncludes(tag.description, query))
      .sort((a, b) => tagScore(b, query) - tagScore(a, query) || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [selectedTags, tagSearch, tagsQuery.data]);

  async function searchLocations(value: string): Promise<void> {
    const query = value.trim();
    if (!query) return;

    setLocationSearch(query);
    setLocationResults([]);
    setMissingLocationName('');

    try {
      const resolved = await resolveScan(api, query).catch(() => null);
      const candidates = new Map<string, LocationSummary>();

      if (resolved?.kind === 'location') {
        candidates.set(resolved.entity.id, resolved.entity);
      } else if (resolved?.kind === 'ambiguous') {
        for (const match of resolved.matches) {
          if (match.kind === 'location') candidates.set(match.id, match);
        }
      }

      const locations = await api.getLocations();
      locations
        .filter((candidate) => fuzzyIncludes(candidate.name, query) || fuzzyIncludes(candidate.description, query))
        .forEach((candidate) => candidates.set(candidate.id, candidate));

      const scored = await Promise.all(
        Array.from(candidates.values())
          .sort((a, b) => locationScore(b, query) - locationScore(a, query) || a.name.localeCompare(b.name))
          .slice(0, 20)
          .map(async (candidate) => ({
            location: candidate,
            subtitle: await getLocationSubtitle(api, candidate.id)
          }))
      );

      if (scored.length === 1) {
        selectLocation(scored[0].location, scored[0].subtitle);
        return;
      }

      setLocationResults(scored);
      if (scored.length) {
        setMessage({ tone: 'info', text: 'Select a destination location.' });
      } else {
        setMissingLocationName(query);
        setMessage({ tone: 'info', text: `No location named “${query}” found. Create it?` });
      }
    } catch (caught) {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to search locations'
      });
    }
  }

  function selectLocation(nextLocation: LocationSummary, subtitle?: string): void {
    setLocation(nextLocation);
    setLocationResults([]);
    setMissingLocationName('');
    setLocationSearch('');
    playSuccessTone();
    setMessage({ tone: 'success', text: `Location set to ${subtitle || nextLocation.name}` });
  }

  function selectTag(tag: TagSummary): void {
    setSelectedTags((current) => (current.some((entry) => entry.id === tag.id) ? current : [...current, tag]));
    setTagSearch('');
    setMessage({ tone: 'success', text: `Added tag ${tag.name}` });
  }

  function removeTag(tagId: string): void {
    setSelectedTags((current) => current.filter((tag) => tag.id !== tagId));
  }

  function addTypedTag(): void {
    const nameToAdd = tagSearch.trim();
    if (!nameToAdd) return;
    const existing = (tagsQuery.data ?? []).find((tag) => tag.name.toLowerCase() === nameToAdd.toLowerCase());
    if (existing) {
      selectTag(existing);
      return;
    }
    selectTag({ id: `new:${nameToAdd.toLowerCase()}`, name: nameToAdd });
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name is required.');
      if (!location) throw new Error('Location is required.');

      const tagIds = await ensureTagIds(api, tagsQuery.data ?? [], selectedTags.map((tag) => tag.name));

      let created = await api.createItem({
        name: name.trim(),
        quantity,
        locationId: location.id,
        tagIds
      });

      if (notes.trim()) {
        const createdItem = await api.getItem(created.id);
        created = await api.updateItem(
          created.id,
          buildItemUpdateFromItem(createdItem, {
            notes: notes.trim()
          })
        );
      } else {
        created = await api.getItem(created.id);
      }

      if (photo) {
        created = await api.uploadAttachment(created.id, photo, {
          name: photo.name,
          type: 'photo',
          primary: true
        });
      }

      return created;
    },
    onSuccess: async (created) => {
      playSuccessTone();
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
      await queryClient.invalidateQueries({ queryKey: ['item', created.id] });
      setMessage({ tone: 'success', text: 'Item created.' });
      navigate(`/item/${created.id}`);
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to create item'
      });
    }
  });

  return (
    <Layout title="Quick Create">
      {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}

      <div className="card form-card">
        <label className="field-label">Name</label>
        <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Item name" />

        <label className="field-label">Quantity</label>
        <input className="text-input" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />

        <ScannerInput
          label="Location"
          placeholder="Scan or search destination location"
          submitLabel="Search"
          helperText={location ? `Selected location: ${location.name}` : 'Scan a label or search by location name. Select one result to assign the new item.'}
          defaultValue={locationSearch}
          onSubmit={searchLocations}
          cameraButton={<CameraScanButton onDetected={(value) => void searchLocations(value)} />}
        />

        {missingLocationName ? (
          <div className="card">
            <div className="section-title">Create missing location?</div>
            <div className="helper-text">No destination matched “{missingLocationName}”.</div>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={() => createLocationMutation.mutate(missingLocationName)} disabled={createLocationMutation.isPending}>
                {createLocationMutation.isPending ? 'Creating…' : `Create “${missingLocationName}”`}
              </button>
              <button type="button" className="secondary-button" onClick={() => setMissingLocationName('')}>Dismiss</button>
            </div>
          </div>
        ) : null}

        {locationResults.length ? (
          <div className="compact-stack">
            {locationResults.map(({ location: result, subtitle }) => (
              <button key={result.id} type="button" className="card entity-select-card" onClick={() => selectLocation(result, subtitle)}>
                <span className="entity-card-title">{result.name}</span>
                <span className="subtle-text">Location{result.itemCount !== undefined ? ` • ${result.itemCount} item(s)` : ''}</span>
                {subtitle ? <span className="helper-text">{subtitle}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        <label className="field-label">Tags</label>
        <div className="inline-field-row">
          <input
            className="text-input"
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (tagResults.length === 1) selectTag(tagResults[0]);
                else addTypedTag();
              }
            }}
            placeholder="Search tags, then select one or more"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" className="secondary-button" onClick={addTypedTag}>
            Add
          </button>
        </div>
        <div className="helper-text">Search existing tags and tap to select. Use Add/Enter to create a new tag if needed.</div>

        {selectedTags.length ? (
          <div className="tag-row spaced">
            {selectedTags.map((tag) => (
              <button key={tag.id} type="button" className="tag-button active" onClick={() => removeTag(tag.id)} title={`Remove ${tag.name}`}>
                <TagPill tag={tag} />
              </button>
            ))}
          </div>
        ) : null}

        {tagResults.length ? (
          <div className="tag-row spaced">
            {tagResults.map((tag) => (
              <button key={tag.id} type="button" className="tag-button" onClick={() => selectTag(tag)}>
                <TagPill tag={tag} />
              </button>
            ))}
          </div>
        ) : tagSearch.trim() ? (
          <div className="helper-text">No existing tag matches. Press Add to create “{tagSearch.trim()}”.</div>
        ) : null}

        <label className="field-label">Notes</label>
        <textarea className="text-area" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" />

        <label className="field-label">Photo</label>
        <input className="text-input" type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
      </div>

      <div className="action-row">
        <button type="button" className="primary-button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating…' : 'Create Item'}
        </button>
        <Link className="secondary-button" to="/scan">Cancel</Link>
      </div>
    </Layout>
  );
}
