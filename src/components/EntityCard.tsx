import { Link } from 'react-router-dom';
import type { EntitySummary } from '../types/homebox';

interface EntityCardProps {
  entity: EntitySummary;
  subtitle?: string;
  to?: string;
}

export function EntityCard({ entity, subtitle, to }: EntityCardProps): JSX.Element {
  const body = (
    <>
      <div className="entity-card-title">{entity.name}</div>
      <div className="subtle-text">
        {entity.kind === 'location' ? 'Location' : 'Item'}
        {'quantity' in entity && entity.quantity !== undefined ? ` • Qty ${entity.quantity}` : ''}
        {'assetId' in entity && entity.assetId ? ` • ${entity.assetId}` : ''}
        {'itemCount' in entity && entity.itemCount !== undefined ? ` • ${entity.itemCount} item(s)` : ''}
      </div>
      {subtitle ? <div className="helper-text">{subtitle}</div> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card entity-card">
        {body}
      </Link>
    );
  }

  return <div className="card entity-card">{body}</div>;
}
