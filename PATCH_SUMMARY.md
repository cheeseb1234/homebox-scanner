# homebox-scanner patch summary

## What changed

- Replaced the broken `entities` / `entity-types` client calls with released HomeBox item/location endpoints.
- Reworked scan resolution to handle item asset IDs, item IDs, location IDs, and URL-style scans.
- Fixed quick-create location assignment to use location lookups that actually exist in released HomeBox.
- Fixed location search/detail to use released location + item endpoints.
- Fixed tag drill-down to query items by tag instead of loading everything through a missing endpoint.
- Fixed move item to patch `locationId`.
- Removed the setup-time hard failure on `status.health !== true`.
- Improved mobile scanner input behavior by removing blur-refocus fighting.
- Added icon + label bottom-nav pills.
- Added an actual default “Open in HomeBox” URL pattern for items with asset IDs.

## Validation

TypeScript compiled successfully and the production Vite build completed successfully.

Note: the copied zip contained a broken local `node_modules/.bin/tsc` shim, so validation was run directly via:

- `node node_modules/typescript/lib/tsc.js -b`
- `node node_modules/vite/bin/vite.js build`

A normal fresh install should recreate working bin links.
