# Skyline local edition

The generated `Skyline-Local.html` is a standalone app. Download it, keep it in
Downloads, and open it in Chrome. On a Chromebook, use the Files app's **Open
with Chrome** action if necessary. There is no Node installation, account,
hosting service, web server, or command to run on the user's computer.

The HTML bundles the interface, React, MapLibre, styles, airport directory,
icons, and software licenses. Actual imagery and aircraft positions are
requested over the internet. This is not an offline tracker.

The local edition uses the same satellite imagery, terrain, aircraft search,
filters, follow mode, trails and favorites as the hosted interface. Favorites
use browser storage when available; file storage can vary by browser or file
location. Sharing copies the aircraft identifier, not a private file path.
Airline schedules, gates and arrival estimates are not connected.

## Live data and limits

Only the documented public APIs from adsb.fi and ADSB.lol are contacted, using
ordinary CORS requests without cookies, keys or an intermediary. The browser
and providers decide whether access is allowed. Packaging as HTML does not
guarantee that a previously unavailable feed will work. Do not disable browser
security, add a proxy to bypass denied access, or change network paths to evade
provider limits. If a provider does not permit local-file requests, it must
authorize a supported access method before live tracking can work.

Regional positions refresh once a minute while the app is visible. Searches
also use requests, cached for 20 seconds and paced by the shared feed adapter.
HTTP 429 responses honor Retry-After; access denials pause the provider for at
least an hour. Feed errors remain readable and last-known data ages visibly.
Use one copy/tab at a time: separate copies do not share a rate-limit budget.
No example aircraft are substituted for live data.

Personal, non-commercial use only under the existing provider terms. Data
attribution remains visible. U.S. imagery is detailed; worldwide NASA imagery
has a lower resolution. Imagery is historical photography, not live video.

## Rebuild from source

With the repository dependencies installed, run `pnpm build:local`.
Output: `local-dist/Skyline-Local.html`. The build uses the existing Vite
dependency and explicitly skips hosting configuration and environment files.
No server code, connector credentials, or runtime API secrets are required.

Validation in the managed development environment covers the bundle,
TypeScript, and the local request adapter. Actual local-file rendering and
live data access must be checked in the user's Chrome browser.
