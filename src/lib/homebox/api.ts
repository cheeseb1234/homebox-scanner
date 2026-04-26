import type {
  ApiSummary,
  BarcodeProduct,
  ConnectionConfig,
  EntityPathItem,
  ItemCreate,
  ItemListResult,
  ItemOut,
  ItemPatch,
  ItemSummary,
  ItemUpdate,
  LocationCreate,
  LocationOut,
  LocationSummary,
  LocationUpdate,
  LoginForm,
  TagSummary,
  TokenResponse,
  TreeItem,
  UserSelf
} from '../../types/homebox';

export interface HomeboxApi {
  getStatus(): Promise<ApiSummary>;
  login(form: LoginForm): Promise<TokenResponse>;
  getSelf(): Promise<UserSelf>;
  searchItems(params?: {
    q?: string;
    page?: number;
    pageSize?: number;
    tags?: string[];
    locations?: string[];
    parentIds?: string[];
  }): Promise<ItemListResult>;
  getItem(id: string): Promise<ItemOut>;
  getItemPath(id: string): Promise<EntityPathItem[]>;
  getLocations(filterChildren?: boolean): Promise<LocationSummary[]>;
  getLocation(id: string): Promise<LocationOut>;
  getLocationPath(id: string): Promise<EntityPathItem[]>;
  getLocationItems(locationId: string, params?: { page?: number; pageSize?: number }): Promise<ItemListResult>;
  getLocationsTree(withItems?: boolean): Promise<TreeItem[]>;
  createItem(payload: ItemCreate): Promise<ItemSummary>;
  patchItem(id: string, payload: ItemPatch): Promise<ItemOut>;
  updateItem(id: string, payload: ItemUpdate): Promise<ItemOut>;
  createLocation(payload: LocationCreate): Promise<LocationSummary>;
  updateLocation(id: string, payload: LocationUpdate): Promise<LocationOut>;
  getTags(): Promise<TagSummary[]>;
  createTag(payload: { name: string; color?: string; icon?: string; description?: string; parentId?: string }): Promise<TagSummary>;
  lookupByAssetId(assetId: string): Promise<ItemListResult>;
  uploadAttachment(itemId: string, file: File, options?: { name?: string; type?: string; primary?: boolean }): Promise<ItemOut>;
  searchProductsFromBarcode(data: string): Promise<BarcodeProduct[]>;
}

function stripTrailingSlash(input: string): string {
  return input.replace(/\/+$/, '');
}

function normalizeAuthToken(token?: string): string | undefined {
  if (!token) return undefined;
  return token.replace(/^Bearer\s+/i, '').trim() || undefined;
}

function buildQuery(params: Record<string, string | number | boolean | string[] | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}


function withLocationKind<T extends LocationSummary>(location: T): T & { kind: 'location' } {
  return {
    ...location,
    kind: 'location'
  };
}

function withLocationOutKind(location: LocationOut): LocationOut {
  return {
    ...withLocationKind(location),
    parent: location.parent ? withLocationKind(location.parent) : location.parent,
    children: location.children?.map(withLocationKind)
  };
}

async function buildLocationPathFromLoader(
  startId: string,
  loadLocation: (id: string) => Promise<LocationOut>
): Promise<EntityPathItem[]> {
  const visited = new Set<string>();
  const chain: EntityPathItem[] = [];
  let currentId: string | undefined = startId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const location = await loadLocation(currentId);
    chain.unshift({ id: location.id, name: location.name, type: 'location' });
    currentId = location.parent?.id;
  }

  return chain;
}

export class HomeboxHttpApi implements HomeboxApi {
  private readonly baseApiUrl: string;
  private token?: string;

  constructor(connection: ConnectionConfig, token?: string) {
    const useDevProxy = String(import.meta.env.VITE_HB_USE_DEV_PROXY || 'false').toLowerCase() === 'true';
    const proxyPath = import.meta.env.VITE_HB_DEV_PROXY_PATH || '/hb-api';
    this.baseApiUrl = useDevProxy ? proxyPath : `${stripTrailingSlash(connection.baseUrl)}/api`;
    this.token = normalizeAuthToken(token);
  }

  setToken(token?: string): void {
    this.token = normalizeAuthToken(token);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${this.baseApiUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  }

  getStatus(): Promise<ApiSummary> {
    return this.request<ApiSummary>('/v1/status', { method: 'GET' });
  }

  login(form: LoginForm): Promise<TokenResponse> {
    return this.request<TokenResponse>('/v1/users/login', {
      method: 'POST',
      body: JSON.stringify(form)
    });
  }

  getSelf(): Promise<UserSelf> {
    return this.request<UserSelf>('/v1/users/self', { method: 'GET' });
  }

  searchItems(params?: {
    q?: string;
    page?: number;
    pageSize?: number;
    tags?: string[];
    locations?: string[];
    parentIds?: string[];
  }): Promise<ItemListResult> {
    const query = buildQuery({
      q: params?.q,
      page: params?.page,
      pageSize: params?.pageSize,
      tags: params?.tags,
      locations: params?.locations,
      parentIds: params?.parentIds
    });

    return this.request<ItemListResult>(`/v1/items${query}`, { method: 'GET' });
  }

  getItem(id: string): Promise<ItemOut> {
    return this.request<ItemOut>(`/v1/items/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async getItemPath(id: string): Promise<EntityPathItem[]> {
    const item = await this.getItem(id);
    const parts: EntityPathItem[] = [];

    if (item.location?.id) {
      parts.push(...(await this.getLocationPath(item.location.id)));
    }

    const parentChain: EntityPathItem[] = [];
    let parentId = item.parent?.id;
    const visited = new Set<string>();

    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = await this.getItem(parentId);
      parentChain.unshift({ id: parent.id, name: parent.name, type: 'item' });
      parentId = parent.parent?.id;
    }

    parts.push(...parentChain, { id: item.id, name: item.name, type: 'item' });
    return parts;
  }

  async getLocations(filterChildren?: boolean): Promise<LocationSummary[]> {
    const query = buildQuery({ filterChildren });
    const locations = await this.request<LocationSummary[]>(`/v1/locations${query}`, { method: 'GET' });
    return locations.map(withLocationKind);
  }

  async getLocation(id: string): Promise<LocationOut> {
    const location = await this.request<LocationOut>(`/v1/locations/${encodeURIComponent(id)}`, { method: 'GET' });
    return withLocationOutKind(location);
  }

  getLocationPath(id: string): Promise<EntityPathItem[]> {
    return buildLocationPathFromLoader(id, (locationId) => this.getLocation(locationId));
  }

  getLocationItems(locationId: string, params?: { page?: number; pageSize?: number }): Promise<ItemListResult> {
    return this.searchItems({
      locations: [locationId],
      page: params?.page,
      pageSize: params?.pageSize
    });
  }

  getLocationsTree(withItems = false): Promise<TreeItem[]> {
    const query = buildQuery({ withItems });
    return this.request<TreeItem[]>(`/v1/locations/tree${query}`, { method: 'GET' });
  }

  createItem(payload: ItemCreate): Promise<ItemSummary> {
    return this.request<ItemSummary>('/v1/items', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  patchItem(id: string, payload: ItemPatch): Promise<ItemOut> {
    return this.request<ItemOut>(`/v1/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  updateItem(id: string, payload: ItemUpdate): Promise<ItemOut> {
    return this.request<ItemOut>(`/v1/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async createLocation(payload: LocationCreate): Promise<LocationSummary> {
    const location = await this.request<LocationSummary>('/v1/locations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return withLocationKind(location);
  }

  async updateLocation(id: string, payload: LocationUpdate): Promise<LocationOut> {
    const location = await this.request<LocationOut>(`/v1/locations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    return withLocationOutKind(location);
  }

  getTags(): Promise<TagSummary[]> {
    return this.request<TagSummary[]>('/v1/tags', { method: 'GET' });
  }

  createTag(payload: { name: string; color?: string; icon?: string; description?: string; parentId?: string }): Promise<TagSummary> {
    return this.request<TagSummary>('/v1/tags', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  lookupByAssetId(assetId: string): Promise<ItemListResult> {
    return this.request<ItemListResult>(`/v1/assets/${encodeURIComponent(assetId)}`, { method: 'GET' });
  }

  async uploadAttachment(itemId: string, file: File, options?: { name?: string; type?: string; primary?: boolean }): Promise<ItemOut> {
    const body = new FormData();
    body.append('file', file);
    body.append('name', options?.name ?? file.name);
    if (options?.type) body.append('type', options.type);
    if (options?.primary !== undefined) body.append('primary', String(options.primary));

    const headers = new Headers();
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);

    const response = await fetch(`${this.baseApiUrl}/v1/items/${encodeURIComponent(itemId)}/attachments`, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      throw new Error((await response.text().catch(() => '')) || `HTTP ${response.status}`);
    }

    return (await response.json()) as ItemOut;
  }

  searchProductsFromBarcode(data: string): Promise<BarcodeProduct[]> {
    const query = buildQuery({ data });
    return this.request<BarcodeProduct[]>(`/v1/products/search-from-barcode${query}`, { method: 'GET' });
  }
}

export function resolveAttachmentUrl(baseUrl: string, path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedBase = stripTrailingSlash(baseUrl);
  return path.startsWith('/') ? `${normalizedBase}${path}` : `${normalizedBase}/${path}`;
}
