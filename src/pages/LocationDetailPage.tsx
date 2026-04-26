import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBanner } from '../components/StatusBanner';
import { EntityCard } from '../components/EntityCard';
import { useSession } from '../state/session';

export function LocationDetailPage(): JSX.Element {
  const { entityId = '' } = useParams();
  const { api } = useSession();

  const locationQuery = useQuery({
    queryKey: ['location', entityId],
    queryFn: () => api.getLocation(entityId)
  });

  const pathQuery = useQuery({
    queryKey: ['location-path', entityId],
    queryFn: () => api.getLocationPath(entityId),
    enabled: Boolean(entityId)
  });

  const contentsQuery = useQuery({
    queryKey: ['location-contents', entityId],
    queryFn: () => api.getLocationItems(entityId, { pageSize: 200 }),
    enabled: Boolean(entityId)
  });

  if (locationQuery.isLoading || contentsQuery.isLoading) {
    return <Layout title="Location View"><div className="card">Loading location…</div></Layout>;
  }

  if (locationQuery.error || !locationQuery.data) {
    return (
      <Layout title="Location View">
        <StatusBanner tone="error" message="Unable to load location." />
      </Layout>
    );
  }

  const location = locationQuery.data;
  const childLocations = location.children || [];
  const childItems = contentsQuery.data?.items || [];

  return (
    <Layout title="Location View">
      <div className="card">
        <div className="entity-name">{location.name}</div>
        <div className="subtle-text">{pathQuery.data?.map((part) => part.name).join(' / ') || location.name}</div>
        <div className="helper-text">{childLocations.length} child location(s) • {childItems.length} item(s)</div>
      </div>

      {childLocations.length ? (
        <div className="stack">
          <div className="section-title">Child locations</div>
          {childLocations.map((child) => (
            <EntityCard key={child.id} entity={child} to={`/location/${child.id}`} />
          ))}
        </div>
      ) : null}

      <div className="stack">
        <div className="section-title">Items in this location</div>
        {childItems.length ? (
          childItems.map((item) => <EntityCard key={item.id} entity={item} to={`/item/${item.id}`} />)
        ) : (
          <div className="card">No items found in this location.</div>
        )}
      </div>
    </Layout>
  );
}
