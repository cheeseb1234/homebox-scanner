# MVP Architecture

## Guiding principle

This app is a thin scanner-first client for HomeBox. HomeBox stays the source of truth.

The PWA:
- stores connection/session state locally in the browser
- calls the HomeBox REST API directly
- uses only temporary UI state and cache
- does not maintain a separate inventory database

## Runtime architecture

### Front end
- React + TypeScript + Vite
- React Router for screen navigation
- TanStack Query for API fetching/caching
- PWA install support via `vite-plugin-pwa`

### Data layer
- `HomeboxHttpApi` wraps HomeBox endpoints under `/api/v1/*`
- `MockHomeboxApi` mirrors the same interface for offline development
- Session state keeps bearer tokens in session storage by default, with an explicit remember-this-device option for persistent local storage

### Scanner flow
1. Wedge scanner types text into a single focused input
2. Enter/newline triggers immediate submit
3. Resolver tries, in order:
   - custom `HBX:ITEM:<id>` / `HBX:LOC:<id>`
   - URL payloads containing entity IDs
   - asset lookup (`GET /api/v1/assets/{code}`)
   - text search (`GET /api/v1/entities?q=...`)
4. Result routes to item detail, location view, or ambiguity recovery

### Move flow
1. Resolve current item
2. Scan destination location
3. `PATCH /api/v1/entities/{itemId}` with `parentId=<locationId>`
4. Invalidate cache and return to item detail

### Quick create flow
1. Resolve destination location
2. `POST /api/v1/entities`
3. If barcode or notes were supplied, follow with `PUT /api/v1/entities/{id}`
4. If photo was supplied, upload with `POST /api/v1/entities/{id}/attachments`

## Auth/session approach

MVP auth is username/password only:
- `POST /api/v1/users/login`
- bearer token stored in browser session storage by default
- persistent local-storage token storage only happens when the user explicitly chooses “Remember this device”
- subsequent requests send `Authorization: Bearer <token>`

OIDC is intentionally left for a later phase because HomeBox's current third-party auth story is redirect-based and not as clean for a separate scanner client.

## Label strategy

### First choice for stable scanner workflows
Use custom labels with payloads:
- `HBX:ITEM:<entity-id>`
- `HBX:LOC:<entity-id>`

### Why
This keeps the scanner app independent from any version-specific native label payload format.

### Native label reuse
The app is compatible with native HomeBox label generation endpoints, but you should scan a few sample labels from your own instance first and verify the exact payload before relying on it.

## Deployment model

### Preferred
Serve this PWA behind the same HTTPS reverse proxy/origin as HomeBox.

### Why
A front-end-only app avoids adding a second backend, but it depends on the browser reaching HomeBox directly. Same-origin hosting keeps CORS and auth behavior simpler.

## Future phase ideas
- deep-link templates per HomeBox version
- batch cycle counting screens
- recent scans list
- optional optimistic caching for spotty Wi-Fi
- printer-friendly custom label generator
