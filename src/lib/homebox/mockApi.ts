import type {
  ApiSummary,
  BarcodeProduct,
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
import type { HomeboxApi } from './api';

const DEFAULT_TAGS: TagSummary[] = [
  { id: 'tag-camping', name: 'camping', color: '#16a34a' },
  { id: 'tag-tools', name: 'tools', color: '#2563eb' },
  { id: 'tag-kitchen', name: 'kitchen', color: '#d97706' }
];

const DEFAULT_LOCATIONS: LocationOut[] = [
  { kind: 'location', id: 'loc-house', name: 'House' },
  { kind: 'location', id: 'loc-basement', name: 'Basement', parent: { kind: 'location', id: 'loc-house', name: 'House' } },
  { kind: 'location', id: 'loc-garage', name: 'Garage', parent: { kind: 'location', id: 'loc-house', name: 'House' } },
  { kind: 'location', id: 'loc-tote-7', name: 'Tote 7', parent: { kind: 'location', id: 'loc-basement', name: 'Basement' } }
];

const DEFAULT_ITEMS: ItemOut[] = [
  {
    kind: 'item',
    id: 'item-lantern',
    name: 'Camping Lantern',
    quantity: 1,
    assetId: 'ITEM-LANTERN-001',
    notes: 'Recharge before next trip.',
    location: { kind: 'location', id: 'loc-tote-7', name: 'Tote 7' },
    tags: [DEFAULT_TAGS[0]]
  },
  {
    kind: 'item',
    id: 'item-wrench',
    name: 'Metric Wrench Set',
    quantity: 1,
    assetId: 'ITEM-WRENCH-001',
    notes: 'Missing 13mm.',
    location: { kind: 'location', id: 'loc-basement', name: 'Basement' },
    tags: [DEFAULT_TAGS[1]]
  }
];

const STORAGE_KEY = 'homebox-scanner-mock-db-v2';

interface MockDb {
  tags: TagSummary[];
  items: ItemOut[];
  locations: LocationOut[];
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // ignore
  }

  const seeded: MockDb = {
    tags: DEFAULT_TAGS,
    items: DEFAULT_ITEMS,
    locations: DEFAULT_LOCATIONS
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveDb(db: MockDb): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function buildLocationPath(locations: LocationOut[], locationId: string): EntityPathItem[] {
  const path: EntityPathItem[] = [];
  let current = locations.find((item) => item.id === locationId);

  while (current) {
    path.unshift({ id: current.id, name: current.name, type: 'location' });
    current = current.parent ? locations.find((item) => item.id === current?.parent?.id) : undefined;
  }

  return path;
}

function toTree(locations: LocationOut[], items: ItemOut[], parentId?: string, withItems = false): TreeItem[] {
  return locations
    .filter((item) => (item.parent?.id || undefined) === parentId)
    .map((location) => ({
      id: location.id,
      name: location.name,
      type: 'location',
      children: [
        ...toTree(locations, items, location.id, withItems),
        ...(withItems
          ? items
              .filter((item) => item.location?.id === location.id)
              .map((item) => ({ id: item.id, name: item.name, type: 'item' }))
          : [])
      ]
    }));
}

function refreshLocationChildren(db: MockDb): void {
  db.locations.forEach((location) => {
    location.children = db.locations
      .filter((child) => child.parent?.id === location.id)
      .map((child) => ({ kind: 'location', id: child.id, name: child.name, description: child.description, createdAt: child.createdAt, updatedAt: child.updatedAt }));
    location.itemCount = db.items.filter((item) => item.location?.id === location.id).length;
  });
}

export class MockHomeboxApi implements HomeboxApi {
  private db = loadDb();

  constructor() {
    refreshLocationChildren(this.db);
  }

  async getStatus(): Promise<ApiSummary> {
    return {
      allowRegistration: false,
      demo: false,
      health: true,
      labelPrinting: true,
      message: 'Mock mode',
      title: 'Mock HomeBox',
      versions: ['mock-0.2']
    };
  }

  async login(form: LoginForm): Promise<TokenResponse> {
    return {
      token: `mock-token-${form.username || 'user'}`,
      attachmentToken: 'mock-attachment-token',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
    };
  }

  async getSelf(): Promise<UserSelf> {
    return {
      item: {
        id: 'mock-user',
        username: 'mock',
        name: 'Mock User',
        email: 'mock@example.com'
      }
    };
  }

  async searchItems(params?: {
    q?: string;
    page?: number;
    pageSize?: number;
    tags?: string[];
    locations?: string[];
    parentIds?: string[];
  }): Promise<ItemListResult> {
    let items = [...this.db.items];

    if (params?.q) {
      const needle = params.q.toLowerCase();
      items = items.filter((item) =>
        [item.name, item.description, item.notes, item.assetId, item.location?.name, item.parent?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    }

    if (params?.tags?.length) {
      items = items.filter((item) => item.tags?.some((tag) => params.tags?.includes(tag.id)));
    }

    if (params?.locations?.length) {
      items = items.filter((item) => item.location?.id && params.locations?.includes(item.location.id));
    }

    if (params?.parentIds?.length) {
      items = items.filter((item) => item.parent?.id && params.parentIds?.includes(item.parent.id));
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 25;
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize).map(deepCopy);

    return {
      items: paged,
      page,
      pageSize,
      total: items.length
    };
  }

  async getItem(id: string): Promise<ItemOut> {
    const item = this.db.items.find((entry) => entry.id === id);
    if (!item) throw new Error('Item not found');
    return deepCopy(item);
  }

  async getItemPath(id: string): Promise<EntityPathItem[]> {
    const item = this.db.items.find((entry) => entry.id === id);
    if (!item) throw new Error('Item not found');

    const parts = item.location?.id ? buildLocationPath(this.db.locations, item.location.id) : [];
    parts.push({ id: item.id, name: item.name, type: 'item' });
    return parts;
  }

  async getLocations(): Promise<LocationSummary[]> {
    refreshLocationChildren(this.db);
    return this.db.locations.map((location) => deepCopy(location));
  }

  async getLocation(id: string): Promise<LocationOut> {
    refreshLocationChildren(this.db);
    const location = this.db.locations.find((entry) => entry.id === id);
    if (!location) throw new Error('Location not found');
    return deepCopy(location);
  }

  async getLocationPath(id: string): Promise<EntityPathItem[]> {
    return buildLocationPath(this.db.locations, id);
  }

  async getLocationItems(locationId: string, params?: { page?: number; pageSize?: number }): Promise<ItemListResult> {
    return this.searchItems({ locations: [locationId], page: params?.page, pageSize: params?.pageSize });
  }

  async getLocationsTree(withItems = false): Promise<TreeItem[]> {
    refreshLocationChildren(this.db);
    return toTree(this.db.locations, this.db.items, undefined, withItems);
  }

  async createItem(payload: ItemCreate): Promise<ItemSummary> {
    const location = payload.locationId ? this.db.locations.find((entry) => entry.id === payload.locationId) : undefined;
    const parent = payload.parentId ? this.db.items.find((entry) => entry.id === payload.parentId) : undefined;
    const tags = (payload.tagIds ?? [])
      .map((id) => this.db.tags.find((tag) => tag.id === id))
      .filter(Boolean) as TagSummary[];

    const item: ItemOut = {
      kind: 'item',
      id: `item-${crypto.randomUUID()}`,
      name: payload.name,
      description: payload.description,
      quantity: payload.quantity ?? 1,
      location: location ? { kind: 'location', id: location.id, name: location.name } : null,
      parent: parent ? deepCopy(parent) : null,
      tags
    };

    this.db.items.unshift(item);
    refreshLocationChildren(this.db);
    saveDb(this.db);
    return deepCopy(item);
  }

  async patchItem(id: string, payload: ItemPatch): Promise<ItemOut> {
    const item = this.db.items.find((entry) => entry.id === id);
    if (!item) throw new Error('Item not found');

    if (payload.locationId !== undefined) {
      const location = payload.locationId ? this.db.locations.find((entry) => entry.id === payload.locationId) : undefined;
      item.location = location ? { kind: 'location', id: location.id, name: location.name } : null;
    }

    if (payload.quantity !== undefined) {
      item.quantity = payload.quantity;
    }

    if (payload.tagIds) {
      item.tags = payload.tagIds
        .map((tagId) => this.db.tags.find((tag) => tag.id === tagId))
        .filter(Boolean) as TagSummary[];
    }

    refreshLocationChildren(this.db);
    saveDb(this.db);
    return deepCopy(item);
  }

  async updateItem(id: string, payload: ItemUpdate): Promise<ItemOut> {
    const item = this.db.items.find((entry) => entry.id === id);
    if (!item) throw new Error('Item not found');

    item.name = payload.name;
    item.description = payload.description;
    item.quantity = payload.quantity;
    item.notes = payload.notes;
    item.assetId = payload.assetId;
    item.manufacturer = payload.manufacturer;
    item.modelNumber = payload.modelNumber;
    item.serialNumber = payload.serialNumber;

    if (payload.locationId !== undefined) {
      const location = payload.locationId ? this.db.locations.find((entry) => entry.id === payload.locationId) : undefined;
      item.location = location ? { kind: 'location', id: location.id, name: location.name } : null;
    }

    if (payload.parentId !== undefined) {
      const parent = payload.parentId ? this.db.items.find((entry) => entry.id === payload.parentId) : undefined;
      item.parent = parent ? deepCopy(parent) : null;
    }

    if (payload.tagIds) {
      item.tags = payload.tagIds
        .map((tagId) => this.db.tags.find((tag) => tag.id === tagId))
        .filter(Boolean) as TagSummary[];
    }

    refreshLocationChildren(this.db);
    saveDb(this.db);
    return deepCopy(item);
  }

  async createLocation(payload: LocationCreate): Promise<LocationSummary> {
    const parent = payload.parentId ? this.db.locations.find((entry) => entry.id === payload.parentId) : undefined;
    const location: LocationOut = {
      kind: 'location',
      id: `loc-${crypto.randomUUID()}`,
      name: payload.name,
      description: payload.description,
      parent: parent ? { kind: 'location', id: parent.id, name: parent.name } : null
    };

    this.db.locations.unshift(location);
    refreshLocationChildren(this.db);
    saveDb(this.db);
    return deepCopy(location);
  }

  async updateLocation(id: string, payload: LocationUpdate): Promise<LocationOut> {
    const location = this.db.locations.find((entry) => entry.id === id);
    if (!location) throw new Error('Location not found');

    if (payload.name !== undefined) location.name = payload.name;
    if (payload.description !== undefined) location.description = payload.description;
    if (payload.parentId !== undefined) {
      const parent = payload.parentId ? this.db.locations.find((entry) => entry.id === payload.parentId) : undefined;
      location.parent = parent ? { kind: 'location', id: parent.id, name: parent.name } : null;
    }

    refreshLocationChildren(this.db);
    saveDb(this.db);
    return deepCopy(location);
  }

  async getTags(): Promise<TagSummary[]> {
    return deepCopy(this.db.tags);
  }

  async createTag(payload: { name: string; color?: string; icon?: string; description?: string; parentId?: string }): Promise<TagSummary> {
    const tag: TagSummary = {
      id: `tag-${crypto.randomUUID()}`,
      name: payload.name,
      color: payload.color,
      icon: payload.icon,
      description: payload.description,
      parentId: payload.parentId
    };

    this.db.tags.push(tag);
    saveDb(this.db);
    return deepCopy(tag);
  }

  async lookupByAssetId(assetId: string): Promise<ItemListResult> {
    const items = this.db.items
      .filter((item) => item.assetId?.toLowerCase() === assetId.toLowerCase())
      .map(deepCopy);

    return {
      items,
      page: 1,
      pageSize: items.length || 25,
      total: items.length
    };
  }

  async uploadAttachment(itemId: string): Promise<ItemOut> {
    const item = this.db.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found');

    item.attachments = [
      {
        id: `attachment-${crypto.randomUUID()}`,
        title: 'mock-photo.jpg',
        type: 'photo',
        primary: true,
        path: '/mock-photo.jpg'
      }
    ];

    saveDb(this.db);
    return deepCopy(item);
  }

  async searchProductsFromBarcode(data: string): Promise<BarcodeProduct[]> {
    return [
      {
        barcode: data,
        manufacturer: 'Mock Brand',
        modelNumber: 'HB-100',
        notes: 'Autofilled from mock barcode lookup.',
        item: {
          name: 'Scanned Item'
        },
        search_engine_name: 'mock-catalog'
      }
    ];
  }
}
