import type { ConnectionConfig, ItemSummary } from '../../types/homebox';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function buildEntityOpenUrl(connection: ConnectionConfig | undefined, item: Pick<ItemSummary, 'id' | 'assetId'>): string | undefined {
  if (!connection) return undefined;

  const template = connection.openEntityUrlTemplate || import.meta.env.VITE_HB_OPEN_ENTITY_URL_TEMPLATE;
  if (template) {
    return template
      .split('{id}').join(item.id)
      .split('{assetId}').join(item.assetId || item.id);
  }

  if (item.assetId) {
    return `${stripTrailingSlash(connection.baseUrl)}/a/${encodeURIComponent(item.assetId)}`;
  }

  return connection.baseUrl;
}
