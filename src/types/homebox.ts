export type AuthMethod = 'password' | 'mock';

export interface ConnectionConfig {
  baseUrl: string;
  authMethod: AuthMethod;
  openEntityUrlTemplate?: string;
}

export interface TokenResponse {
  token: string;
  attachmentToken?: string;
  expiresAt?: string;
}

export interface LoginForm {
  username: string;
  password: string;
  stayLoggedIn?: boolean;
}

export interface UserSelf {
  item?: {
    id?: string;
    name?: string;
    email?: string;
    username?: string;
  };
}

export interface ApiSummary {
  allowRegistration?: boolean;
  demo?: boolean;
  health?: boolean;
  labelPrinting?: boolean;
  message?: string;
  title?: string;
  versions?: string[];
  build?: {
    version?: string;
    commit?: string;
    time?: string;
  };
}

export interface TagSummary {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  description?: string;
  parentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocationSummary {
  kind: 'location';
  id: string;
  name: string;
  description?: string;
  itemCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ItemAttachmentThumbnail {
  id: string;
  path?: string;
}

export interface ItemAttachment {
  id: string;
  path?: string;
  mimeType?: string;
  primary?: boolean;
  title?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  thumbnail?: ItemAttachmentThumbnail;
}

export interface ItemField {
  name?: string;
  value?: string;
  type?: string;
}

export interface ItemSummary {
  kind: 'item';
  id: string;
  name: string;
  description?: string;
  quantity?: number;
  assetId?: string;
  imageId?: string;
  thumbnailId?: string;
  purchasePrice?: number;
  soldTime?: string;
  insured?: boolean;
  tags?: TagSummary[];
  location?: LocationSummary | null;
  parent?: ItemSummary | null;
  archived?: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export interface ItemOut extends ItemSummary {
  notes?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  purchaseFrom?: string;
  soldTo?: string;
  purchaseTime?: string;
  soldPrice?: number;
  soldNotes?: string;
  warrantyExpires?: string;
  warrantyDetails?: string;
  lifetimeWarranty?: boolean;
  syncChildItemsLocations?: boolean;
  fields?: ItemField[];
  attachments?: ItemAttachment[];
}

export interface LocationOut extends LocationSummary {
  parent?: LocationSummary | null;
  children?: LocationSummary[];
  totalPrice?: number;
}

export type EntitySummary = ItemSummary | LocationSummary;
export type EntityOut = ItemOut | LocationOut;

export interface ItemListResult {
  items: ItemSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPrice?: number;
}

export interface ItemCreate {
  name: string;
  description?: string;
  locationId?: string;
  parentId?: string;
  quantity?: number;
  tagIds?: string[];
}

export interface ItemPatch {
  id?: string;
  locationId?: string | null;
  quantity?: number;
  tagIds?: string[];
}

export interface ItemUpdate {
  id?: string;
  name: string;
  description?: string;
  locationId?: string;
  parentId?: string;
  quantity?: number;
  tagIds?: string[];
  assetId?: string;
  notes?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  purchaseFrom?: string;
  purchasePrice?: number;
  purchaseTime?: string;
  soldTo?: string;
  soldPrice?: number;
  soldTime?: string;
  soldNotes?: string;
  insured?: boolean;
  lifetimeWarranty?: boolean;
  warrantyExpires?: string;
  warrantyDetails?: string;
  syncChildItemsLocations?: boolean;
  archived?: boolean;
  fields?: ItemField[];
}

export interface LocationCreate {
  name: string;
  description?: string;
  parentId?: string | null;
}

export interface LocationUpdate {
  id?: string;
  name?: string;
  description?: string;
  parentId?: string | null;
}

export interface TreeItem {
  id: string;
  name: string;
  type?: string;
  children?: TreeItem[];
}

export interface EntityPathItem {
  id: string;
  name: string;
  type?: string;
}

export interface BarcodeProduct {
  barcode?: string;
  manufacturer?: string;
  modelNumber?: string;
  notes?: string;
  imageURL?: string;
  imageBase64?: string;
  item?: Partial<ItemCreate> & { name?: string };
  search_engine_name?: string;
}

export interface SessionState {
  connection?: ConnectionConfig;
  token?: string;
  attachmentToken?: string;
  expiresAt?: string;
  username?: string;
  connected: boolean;
  rememberLogin?: boolean;
}
