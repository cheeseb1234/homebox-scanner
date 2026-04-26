import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBanner } from '../components/StatusBanner';
import { AuthImage } from '../components/AuthImage';
import { TagPill } from '../components/TagPill';
import { buildEntityOpenUrl } from '../lib/homebox/openInHomebox';
import { useSession } from '../state/session';

export function ItemDetailPage(): JSX.Element {
  const { entityId = '' } = useParams();
  const { api, session } = useSession();

  const entityQuery = useQuery({
    queryKey: ['item', entityId],
    queryFn: () => api.getItem(entityId)
  });

  const pathQuery = useQuery({
    queryKey: ['item-path', entityId],
    queryFn: () => api.getItemPath(entityId),
    enabled: Boolean(entityId)
  });

  if (entityQuery.isLoading) {
    return <Layout title="Item Detail"><div className="card">Loading item…</div></Layout>;
  }

  if (entityQuery.error || !entityQuery.data) {
    return (
      <Layout title="Item Detail">
        <StatusBanner tone="error" message="Unable to load item details." />
      </Layout>
    );
  }

  const entity = entityQuery.data;
  const primaryAttachment = entity.attachments?.find((attachment) => attachment.primary) || entity.attachments?.[0];
  const openUrl = buildEntityOpenUrl(session.connection, entity);

  return (
    <Layout title="Item Detail">
      <div className="card">
        <div className="entity-header">
          <div>
            <div className="entity-name">{entity.name}</div>
            <div className="subtle-text">{entity.assetId || 'No barcode/asset code yet'}</div>
          </div>
          <div className="quantity-badge">Qty {entity.quantity ?? 1}</div>
        </div>

        <AuthImage
          baseUrl={session.connection?.baseUrl || window.location.origin}
          token={session.token}
          path={primaryAttachment?.thumbnail?.path || primaryAttachment?.path}
          alt={entity.name}
        />

        {entity.tags?.length ? (
          <div className="tag-row">
            {entity.tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
          </div>
        ) : null}

        <div className="detail-grid">
          <div>
            <span className="detail-label">Current location</span>
            <div>{pathQuery.data?.filter((part) => part.type === 'location').map((part) => part.name).join(' / ') || entity.location?.name || 'No location'}</div>
          </div>
          {entity.description ? (
            <div>
              <span className="detail-label">Description</span>
              <div>{entity.description}</div>
            </div>
          ) : null}
          {entity.notes ? (
            <div>
              <span className="detail-label">Notes</span>
              <div className="multiline-text">{entity.notes}</div>
            </div>
          ) : null}
          {entity.serialNumber ? (
            <div>
              <span className="detail-label">Serial</span>
              <div>{entity.serialNumber}</div>
            </div>
          ) : null}
          {entity.manufacturer || entity.modelNumber ? (
            <div>
              <span className="detail-label">Manufacturer / Model</span>
              <div>{[entity.manufacturer, entity.modelNumber].filter(Boolean).join(' / ')}</div>
            </div>
          ) : null}
        </div>

        <div className="action-row wrap">
          <Link className="primary-button" to={`/move/${entity.id}`}>Move</Link>
          <Link className="secondary-button" to={`/quantity/${entity.id}`}>Adjust Qty</Link>
          <Link className="secondary-button" to="/create">Quick Create</Link>
          {openUrl ? (
            <a className="secondary-button" href={openUrl} target="_blank" rel="noreferrer">
              Open in HomeBox
            </a>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
