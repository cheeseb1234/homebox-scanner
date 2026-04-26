import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { TagPill } from '../components/TagPill';
import { EntityCard } from '../components/EntityCard';
import { StatusBanner } from '../components/StatusBanner';
import { CameraScanButton } from '../components/CameraScanButton';
import { playErrorTone, playSuccessTone } from '../lib/audio';
import { useSession } from '../state/session';

export function TagSearchPage(): JSX.Element {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [activeTagId, setActiveTagId] = useState<string>('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.getTags()
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => api.createTag({ name }),
    onSuccess: async (tag) => {
      playSuccessTone();
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
      setActiveTagId(tag.id);
      setTerm(tag.name);
      setMessage({ tone: 'success', text: `Created tag ${tag.name}.` });
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to create tag.'
      });
    }
  });

  const itemsByTagQuery = useQuery({
    queryKey: ['tag-items', activeTagId],
    queryFn: async () => (await api.searchItems({ tags: [activeTagId], pageSize: 200 })).items,
    enabled: Boolean(activeTagId)
  });

  const itemBreadcrumbsQuery = useQuery({
    queryKey: ['tag-item-breadcrumbs', activeTagId, (itemsByTagQuery.data || []).map((item) => item.id).join(',')],
    queryFn: async () => {
      const breadcrumbs: Record<string, string> = {};
      await Promise.all((itemsByTagQuery.data || []).map(async (item) => {
        try {
          const path = await api.getItemPath(item.id);
          const locationPath = path.filter((part) => part.type === 'location');
          if (locationPath.length) {
            breadcrumbs[item.id] = locationPath.map((part) => part.name).join(' - ');
          } else if (item.location?.name) {
            breadcrumbs[item.id] = item.location.name;
          }
        } catch {
          // Breadcrumbs are context only; keep the item list usable if one path lookup fails.
        }
      }));
      return breadcrumbs;
    },
    enabled: Boolean(activeTagId && itemsByTagQuery.data?.length)
  });

  const normalizedTerm = term.trim().toLowerCase();
  const filteredTags = useMemo(
    () => (tagsQuery.data || []).filter((tag) => tag.name.toLowerCase().includes(normalizedTerm)),
    [normalizedTerm, tagsQuery.data]
  );
  const exactTagExists = Boolean(normalizedTerm && (tagsQuery.data || []).some((tag) => tag.name.toLowerCase() === normalizedTerm));
  const canCreateTag = Boolean(term.trim() && !exactTagExists && !tagsQuery.isLoading);

  function handleScannedTag(value: string): void {
    const scanned = value.trim();
    if (!scanned) return;
    setTerm(scanned);
    const existing = (tagsQuery.data || []).find((tag) => tag.name.toLowerCase() === scanned.toLowerCase());
    if (existing) {
      setActiveTagId(existing.id);
      setMessage({ tone: 'success', text: `Selected tag ${existing.name}.` });
    } else {
      setMessage({ tone: 'info', text: `No tag named “${scanned}” found. Create it?` });
    }
  }

  function createSearchedTag(): void {
    const name = term.trim();
    if (!name) return;
    createTagMutation.mutate(name);
  }

  return (
    <Layout title="Tag Search">
      {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}
      {itemsByTagQuery.error ? <StatusBanner tone="error" message={itemsByTagQuery.error instanceof Error ? itemsByTagQuery.error.message : 'Unable to load tag items.'} /> : null}

      <div className="card">
        <label className="field-label">Search Tag</label>
        <div className="inline-field-row">
          <input
            className="text-input"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canCreateTag) {
                event.preventDefault();
                createSearchedTag();
              }
            }}
            placeholder="Search tags"
          />
          {canCreateTag ? (
            <button type="button" className="secondary-button" onClick={createSearchedTag} disabled={createTagMutation.isPending}>
              {createTagMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          ) : (
            <CameraScanButton onDetected={handleScannedTag} />
          )}
        </div>
        {canCreateTag ? (
          <div className="action-row">
            <CameraScanButton onDetected={handleScannedTag} />
          </div>
        ) : null}

        {canCreateTag ? <div className="helper-text">No exact tag named “{term.trim()}”. Create it or pick an existing match below.</div> : null}

        <div className="tag-row spaced">
          {filteredTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`tag-button ${activeTagId === tag.id ? 'active' : ''}`}
              onClick={() => setActiveTagId(tag.id)}
            >
              <TagPill tag={tag} />
            </button>
          ))}
        </div>
      </div>

      {itemsByTagQuery.isLoading ? <div className="card">Loading tagged items…</div> : null}

      <div className="stack">
        {(itemsByTagQuery.data || []).map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            subtitle={itemBreadcrumbsQuery.data?.[entity.id]}
            to={`/item/${entity.id}`}
          />
        ))}
      </div>
    </Layout>
  );
}
