import type { EntityPathItem, EntitySummary, ItemOut, ItemSummary, ItemUpdate, LocationSummary, TagSummary } from '../../types/homebox';
import type { HomeboxApi } from './api';

export function isLocationEntity(entity: EntitySummary | undefined | null): entity is LocationSummary {
  return Boolean(entity && entity.kind === 'location');
}

export function getCurrentLocationLabel(path: EntityPathItem[] | undefined): string {
  if (!path?.length) return 'No location';
  const locations = path.filter((part) => part.type === 'location');
  if (!locations.length) return 'No location';
  return locations.map((part) => part.name).join(' / ');
}

export async function ensureTagIds(api: HomeboxApi, existing: TagSummary[], names: string[]): Promise<string[]> {
  const result: string[] = [];

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;

    const found = existing.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (found) {
      result.push(found.id);
      continue;
    }

    const created = await api.createTag({ name });
    result.push(created.id);
  }

  return Array.from(new Set(result));
}

export function buildItemUpdateFromItem(item: ItemOut, overrides?: Partial<ItemOut>): ItemUpdate {
  return {
    name: overrides?.name ?? item.name,
    description: overrides?.description ?? item.description,
    locationId: overrides?.location?.id ?? item.location?.id,
    parentId: overrides?.parent?.id ?? item.parent?.id,
    quantity: overrides?.quantity ?? item.quantity,
    tagIds: (overrides?.tags ?? item.tags ?? []).map((tag) => tag.id),
    assetId: overrides?.assetId ?? item.assetId,
    notes: overrides?.notes ?? item.notes,
    manufacturer: overrides?.manufacturer ?? item.manufacturer,
    modelNumber: overrides?.modelNumber ?? item.modelNumber,
    serialNumber: overrides?.serialNumber ?? item.serialNumber,
    purchaseFrom: overrides?.purchaseFrom ?? item.purchaseFrom,
    purchasePrice: overrides?.purchasePrice ?? item.purchasePrice,
    purchaseTime: overrides?.purchaseTime ?? item.purchaseTime,
    soldTo: overrides?.soldTo ?? item.soldTo,
    soldPrice: overrides?.soldPrice ?? item.soldPrice,
    soldTime: overrides?.soldTime ?? item.soldTime,
    soldNotes: overrides?.soldNotes ?? item.soldNotes,
    insured: overrides?.insured ?? item.insured,
    lifetimeWarranty: overrides?.lifetimeWarranty ?? item.lifetimeWarranty,
    warrantyExpires: overrides?.warrantyExpires ?? item.warrantyExpires,
    warrantyDetails: overrides?.warrantyDetails ?? item.warrantyDetails,
    syncChildItemsLocations: overrides?.syncChildItemsLocations ?? item.syncChildItemsLocations,
    archived: overrides?.archived ?? item.archived,
    fields: overrides?.fields ?? item.fields
  };
}

export async function listAllItems(
  api: HomeboxApi,
  options?: { q?: string; tags?: string[]; locations?: string[]; pageSize?: number; maxPages?: number }
): Promise<ItemSummary[]> {
  const pageSize = options?.pageSize ?? 200;
  const maxPages = options?.maxPages ?? 10;
  let page = 1;
  let totalPages = 1;
  const all: ItemSummary[] = [];

  while (page <= totalPages && page <= maxPages) {
    const result = await api.searchItems({
      q: options?.q,
      tags: options?.tags,
      locations: options?.locations,
      page,
      pageSize
    });
    all.push(...(result.items || []));

    if (!result.total || !result.pageSize) break;
    totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    page += 1;
  }

  return all;
}

export function filterLocationsByTerm(locations: LocationSummary[], term: string): LocationSummary[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return locations;

  return locations.filter((location) =>
    [location.name, location.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  );
}
