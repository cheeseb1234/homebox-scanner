import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ScannerInput } from '../components/ScannerInput';
import { StatusBanner } from '../components/StatusBanner';
import { CameraScanButton } from '../components/CameraScanButton';
import { EntityCard } from '../components/EntityCard';
import { playErrorTone, playSuccessTone } from '../lib/audio';
import { resolveScan } from '../lib/homebox/scanResolver';
import { filterLocationsByTerm } from '../lib/homebox/helpers';
import { useSession } from '../state/session';
import type { LocationSummary, TreeItem } from '../types/homebox';

interface LocationTreeNodeProps {
  node: TreeItem;
  depth?: number;
  defaultOpen?: boolean;
}

function countTreeChildren(node: TreeItem): number {
  return (node.children || []).reduce((total, child) => total + 1 + countTreeChildren(child), 0);
}

function LocationTreeNode({ node, depth = 0, defaultOpen }: LocationTreeNodeProps): JSX.Element {
  const children = node.children || [];
  const hasChildren = children.length > 0;
  const descendantCount = countTreeChildren(node);

  if (!hasChildren) {
    return (
      <Link className="location-tree-leaf" style={{ '--tree-depth': depth } as CSSProperties} to={`/location/${node.id}`}>
        <span className="location-tree-spacer" aria-hidden="true" />
        <span className="location-tree-name">{node.name}</span>
      </Link>
    );
  }

  return (
    <details className="location-tree-branch" open={defaultOpen || depth < 1}>
      <summary className="location-tree-summary" style={{ '--tree-depth': depth } as CSSProperties}>
        <span className="location-tree-chevron" aria-hidden="true">›</span>
        <span className="location-tree-name">{node.name}</span>
        <span className="location-tree-count">{descendantCount}</span>
      </summary>
      <div className="location-tree-children">
        {children.map((child) => (
          <LocationTreeNode key={child.id} node={child} depth={depth + 1} defaultOpen={defaultOpen} />
        ))}
      </div>
    </details>
  );
}

export function LocationSearchPage(): JSX.Element {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();
  const [results, setResults] = useState<LocationSummary[]>([]);
  const [missingLocationName, setMissingLocationName] = useState('');
  const [treeFilter, setTreeFilter] = useState('');

  const treeQuery = useQuery({
    queryKey: ['locations-tree'],
    queryFn: () => api.getLocationsTree(false)
  });

  const createLocationMutation = useMutation({
    mutationFn: async (name: string) => api.createLocation({ name }),
    onSuccess: async (created) => {
      playSuccessTone();
      setMissingLocationName('');
      setResults([created]);
      setTreeFilter('');
      await queryClient.invalidateQueries({ queryKey: ['locations-tree'] });
      setMessage({ tone: 'success', text: `Created location: ${created.name}` });
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Unable to create location.' });
    }
  });

  const visibleTree = useMemo(() => {
    const term = treeFilter.trim().toLowerCase();
    if (!term) return treeQuery.data || [];

    function filterNode(node: TreeItem): TreeItem | null {
      const filteredChildren = (node.children || [])
        .map(filterNode)
        .filter((child): child is TreeItem => Boolean(child));

      if (node.name.toLowerCase().includes(term) || filteredChildren.length) {
        return { ...node, children: filteredChildren };
      }

      return null;
    }

    return (treeQuery.data || [])
      .map(filterNode)
      .filter((node): node is TreeItem => Boolean(node));
  }, [treeFilter, treeQuery.data]);

  async function submit(value: string): Promise<void> {
    try {
      const searchTerm = value.trim();
      setMissingLocationName('');
      const resolved = await resolveScan(api, searchTerm).catch(() => null);
      if (resolved?.kind === 'location') {
        playSuccessTone();
        setResults([resolved.entity]);
        setMessage({ tone: 'success', text: `Resolved location: ${resolved.entity.name}` });
        return;
      }

      if (resolved?.kind === 'ambiguous') {
        const locations = resolved.matches.filter((item) => item.kind === 'location');
        setResults(locations);
        setMessage({ tone: locations.length ? 'success' : 'error', text: locations.length ? `Found ${locations.length} location(s).` : 'No locations found.' });
        return;
      }

      const locations = filterLocationsByTerm(await api.getLocations(), searchTerm);
      setResults(locations);

      if (!locations.length) {
        playErrorTone();
        setMissingLocationName(searchTerm);
        setMessage({ tone: 'info', text: `No location named “${searchTerm}” found. Create it?` });
      } else {
        playSuccessTone();
        setMessage({ tone: 'success', text: `Found ${locations.length} location(s).` });
      }
    } catch (caught) {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to search locations'
      });
    }
  }

  return (
    <Layout title="Locations">
      {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}

      <ScannerInput
        label="Location scan / search"
        placeholder="Scan location or search by name"
        onSubmit={submit}
        cameraButton={<CameraScanButton onDetected={(value) => void submit(value)} />}
      />

      {missingLocationName ? (
        <div className="card">
          <div className="section-title">Create missing location?</div>
          <div className="helper-text">No location matched “{missingLocationName}”.</div>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => createLocationMutation.mutate(missingLocationName)} disabled={createLocationMutation.isPending}>
              {createLocationMutation.isPending ? 'Creating…' : `Create “${missingLocationName}”`}
            </button>
            <button type="button" className="secondary-button" onClick={() => setMissingLocationName('')}>Dismiss</button>
          </div>
        </div>
      ) : null}

      {results.length ? (
        <section className="field-section">
          <div className="section-heading-row">
            <div>
              <div className="eyebrow">Search results</div>
              <div className="section-title">Matching locations</div>
            </div>
          </div>
          <div className="stack compact-stack">
            {results.map((location) => (
              <EntityCard key={location.id} entity={location} to={`/location/${location.id}`} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="field-section">
        <div className="section-heading-row">
          <div>
            <div className="eyebrow">Browse</div>
            <div className="section-title">Location tree</div>
          </div>
          <button className="text-button" type="button" onClick={() => setTreeFilter('')}>Clear</button>
        </div>

        <div className="card location-tree-card">
          <input
            className="text-input location-tree-filter"
            value={treeFilter}
            onChange={(event) => setTreeFilter(event.target.value)}
            placeholder="Filter location tree"
            type="search"
          />

          {treeQuery.isLoading ? <div className="helper-text">Loading location tree…</div> : null}
          {treeQuery.error ? <StatusBanner tone="error" message="Unable to load location tree." /> : null}

          <div className="location-tree-list">
            {visibleTree.map((node) => (
              <LocationTreeNode key={node.id} node={node} defaultOpen={Boolean(treeFilter)} />
            ))}
          </div>

          {!treeQuery.isLoading && !visibleTree.length ? (
            <div className="helper-text">No locations match that filter.</div>
          ) : null}
        </div>
      </section>
    </Layout>
  );
}
