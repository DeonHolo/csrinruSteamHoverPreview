# Media Slider and Click-to-Play Video Design

## Context

The current hover preview shows one Steam `header_image` at the top of the tooltip. The goal is to let users inspect more Steam media without leaving the CS.RIN.RU topic list, while keeping the hover preview fast and compact.

This feature adds a lightweight media carousel:

- Default media item remains the current Steam header image.
- Screenshots can be browsed with left/right controls.
- Steam videos can appear in the carousel as click-to-play items.
- Videos must not autoplay and must not be preloaded during normal hover.

## Scope

In scope:

- Read screenshots and movies from the existing Steam `appdetails` response when available.
- Store media metadata in the normal Steam cache alongside the rest of the app data.
- Render a stable media frame at the top of the hover card.
- Add previous/next controls only when more than one media item exists.
- Add a compact thumbnail strip below the main media frame when more than one media item exists.
- Let sparse thumbnail strips stretch across the media frame instead of ending as a short partial rail.
- Add a Steam-like theatre overlay for larger screenshot inspection and trailer playback.
- Add a browser fullscreen toggle inside theatre mode.
- Keep Steam header/cover art out of theatre mode because it is not high enough resolution for full-window viewing.
- Show screenshots as images.
- Show videos as poster thumbnails with a play affordance.
- Open trailers in theatre mode as real video playback immediately, not as enlarged poster thumbnails.
- Add Steam-like bottom video controls for play/pause, mute, seek, and video fullscreen.
- Replace a video poster with a playable video only after the user explicitly clicks it.
- Keep the existing title, release date, AppID, SteamDB, thread tags, description, rating, Steam tags/genres, and action links below the media.
- Keep long CS.RIN.RU thread tags bold and allow them to use available metadata-row width before truncating.

Out of scope:

- Manual scraping for screenshots or videos.
- Autoplaying videos.
- Preloading video files before user interaction.
- Persisting the user's current media index across topics or page loads.

## Data Source

Steam `appdetails` commonly includes:

- `header_image`
- `screenshots`
- `movies`

The implementation will build a normalized `media` array during Steam data assembly:

```txt
[
  { type: "image", source: "header", url, alt },
  { type: "video", source: "movie", posterUrl, videoUrl, videoSources, hlsUrl, alt },
  { type: "image", source: "screenshot", url, thumbUrl, alt }
]
```

The header image is always first when present. Videos follow so trailers are discoverable without walking through a long screenshot list. Screenshots come after videos.

Movie entries prefer a web-compatible MP4/WebM URL from Steam's movie data when available. Theatre playback tries direct MP4/WebM files first because direct Steam trailer files are the only reliable inline trailer path on CS.RIN.RU in Chromium. Current Steam responses often expose trailers only as `hls_h264` or DASH manifests; those entries remain visible as video thumbnails, but HLS playback is only attempted when the browser reports native HLS support. Chromium requires a `blob:` MediaSource URL for hls.js/MSE playback, and CS.RIN.RU's page CSP blocks that `blob:` media URL, so HLS-only trailers fall back to an explicit Open on Steam link instead of a dead player.

## UX Design

Use an overlay-control carousel inside a slightly wider top media area:

- The tooltip can grow to about 420px wide to give screenshots and trailer posters enough inspection room without turning the hover card into a large panel.
- The media frame keeps a fixed aspect ratio matching Steam header art.
- Left and right controls sit over the media edges.
- A small counter sits in the top-right corner, such as `1 / 7`, so it does not collide with native video controls.
- A compact thumbnail strip sits directly below the media frame.
- Sparse thumbnail strips stretch their preview cards across the rail so the bottom media area still reads as intentional.
- The active thumbnail has a clear border/selected state.
- Video thumbnails use the movie poster and include a small play marker.
- A small expand control sits over screenshots and video posters only; it is hidden on the Steam header art.
- Video items show a centered play affordance over the poster.
- Clicking the poster/play affordance loads and plays the video.
- HLS trailers use native browser playback when available; Chromium on CS.RIN.RU shows an Open on Steam fallback for HLS-only trailers because the page CSP blocks the `blob:` media URL required by hls.js/MSE.
- Clicking a thumbnail switches the main media frame without opening Steam or hiding the tooltip.
- Clicking carousel arrows never opens Steam and never hides the tooltip.
- The default hover state still looks like today's preview: the header image is visible with no required interaction.

The thumbnail strip is intentionally shallow: it improves scanning and video discoverability, but the main card remains a hover preview rather than a full Steam media browser.

Theatre mode uses a centered dark overlay inspired by Steam's screenshots/trailer viewer, and follows Steam's hidden-video navigation model:

- Opening theatre from a screenshot creates a screenshot-only gallery.
- Screenshot theatre uses `object-fit: contain` so screenshots are not cropped.
- Screenshot theatre shows large left/right controls, a centered footer counter, and a bottom-right fullscreen control.
- Screenshot theatre counts videos and screenshots in the footer index, but skips videos during screenshot navigation.
- Opening theatre from a video creates a player for that clicked video plus the screenshot gallery.
- Video theatre renders a real `video` element immediately with custom Steam-like bottom controls, autoplay, and no enlarged poster screen.
- Normal video theatre controls render as their own full-width row between the video stage and the theatre counter footer, so they cannot be clipped or hidden by the footer. Video-only fullscreen keeps a separate full-width overlay inside the fullscreen video wrapper.
- Video theatre can navigate from the launched trailer into screenshots, but does not expose other trailers unless the user opened that trailer directly from the hover card.
- Once video theatre moves into a screenshot, the session becomes screenshot-only; navigation cannot return to the launched video.
- Header bar shows the game title and `Trailers & Screenshots`.
- Close sits in the header; screenshot footer controls include fullscreen, while video controls include video fullscreen.
- Normal theatre mode is a centered Steam-sized modal; browser fullscreen expands the theatre overlay to the full display.
- Video fullscreen expands the video/player surface while preserving the custom controls.
- Clicking the backdrop outside the centered modal closes theatre mode.

## Interaction Behavior

Carousel state is local to the currently rendered tooltip.

- On each new hover render, media index starts at `0`.
- Previous wraps from first item to last item.
- Next wraps from last item to first item.
- Arrow buttons use `button` elements with accessible labels.
- Thumbnail buttons use `button` elements with accessible labels and `aria-current` on the active item.
- Keyboard focus must be possible for carousel buttons while the tooltip is interactive.
- Clicking the hover-card expand button opens theatre mode at the current screenshot or trailer.
- The expand button is not shown for the Steam header image.
- Screenshot theatre supports close, previous, next, and fullscreen controls.
- Video theatre supports close, one-way navigation to screenshots, video fullscreen, and custom video controls.
- Theatre mode supports `Escape` to close and arrow keys to navigate.
- Video theatre uses Left/Right keyboard input for video seeking instead of screenshot navigation while the video is active.
- Clicking the active theatre video toggles play/pause.
- Clicking a screenshot does nothing in this iteration.
- Clicking a screenshot thumbnail switches to that screenshot.
- Clicking a video poster replaces it with a `video` element using `controls`, `autoplay`, and `playsinline`.
- Video loading starts only after that explicit click.
- Moving to another carousel item stops and removes the active video element.
- Hiding the tooltip stops and removes any active video element.
- Closing theatre mode stops and removes any active theatre video instance.

## Performance

The hover must stay fast:

- Do not make a second request just for media.
- Do not scrape the Steam store page for media.
- Do not preload video files.
- Do not eagerly create hidden video elements.
- Use Steam's full screenshot URL for the main media frame when available, while keeping screenshot thumbnails for the bottom strip.
- Use image URLs from the Steam API response and let the browser load visible media images and thumbnail images.
- Keep the media frame dimensions stable to avoid tooltip layout jumps.
- Do not create hidden video elements for thumbnails.
- Do not initialize native HLS playback until the user clicks a video poster.
- Do not initialize theatre native HLS playback until the user explicitly opens a trailer in theatre mode.
- Do not use hls.js/MSE on CS.RIN.RU because the page CSP blocks `blob:` media URLs.
- Use the highest direct MP4/WebM source by default for direct-file playback.
- Lock document scrolling only while theatre mode is open, then restore it on close.

Since media metadata comes from the same `appdetails` response already used for descriptions, release dates, and other details, the main new cost is rendering and loading the visible media asset.

## Caching

Media metadata is part of the successful Steam data object and follows the existing successful-cache TTL of 24 hours.

- If cached data has media, render the carousel immediately.
- If cached data has media saved from an earlier 3.0 test build, rebuild media from the cached Steam `movies`/`screenshots` fields when available, then apply the current display order.
- If cached data predates this feature and has no normalized `media` array, fall back to `header_image`.
- Failed lookups still use the existing short failed-cache behavior.
- Clearing the hover cache clears media metadata too.

## Error Handling

- If `screenshots` or `movies` is missing, render only the header image.
- If no media is available, omit the media frame.
- If a screenshot fails to load, hide that image and continue showing the rest of the card.
- If a video fails to load, keep the poster visible and do not retry automatically.
- If a trailer has only HLS/DASH sources that Chromium cannot play inline on CS.RIN.RU, show a short fallback message with an Open on Steam link instead of a dead video player.
- If a media URL is malformed, skip that item while normalizing media.
- If there is only one media item, hide carousel controls, counter, and thumbnail strip.
- If fullscreen is denied by the browser, keep theatre mode open normally.
- If multiple direct video files are available, use the preferred highest-quality direct source selected during media normalization.

## Code Organization

Add small helpers instead of folding the carousel into the existing render function:

- `normalizeSteamMedia(appData)` returns media items.
- `renderMediaCarousel(media, title)` returns the media-frame HTML.
- `renderMediaItem(item, index, title)` returns image or video-poster HTML.
- `renderMediaThumbs(media, activeIndex, title)` returns thumbnail-strip HTML.
- `setActiveMedia(index)` updates the visible media item in the current tooltip.
- `stopActiveVideo()` stops/removes any active video when navigating or hiding.
- `renderTheatre()` renders the centered media overlay.
- `setTheatreMedia(index)` updates the visible theatre media item.
- `getTheatreSelection(index)` filters the hover media into Steam-like theatre collections: screenshots-only when launched from a screenshot, or the launched video plus screenshots when launched from a video.
- `playTheatreVideo()` handles direct video playback, native HLS when supported, and the Steam fallback message when inline playback is blocked.
- Direct MP4/WebM video sources are tried before native HLS to avoid avoidable Steam HLS failures.
- `closeTheatre()` stops playback, clears theatre state, and restores page scrolling.

Event handling stays delegated from the tooltip:

- `.steamMediaPrevBtn` decrements media index.
- `.steamMediaNextBtn` increments media index.
- `.steamMediaThumbBtn` selects a media index.
- `.steamMediaPlayBtn` loads the selected video.
- `.steamMediaExpandBtn` opens theatre mode only for screenshots and videos.
- `.csrinruSteamTheatre*` controls handle theatre close, fullscreen, navigation, and custom video controls.
- Existing AppID copy behavior must remain independent.

## Testing

Manual checks:

- Hover a game with screenshots and confirm the header image is still first.
- Confirm video thumbnails appear immediately after the header when movie data exists.
- Click thumbnail cards and confirm the main media frame updates without hiding the tooltip.
- Confirm sparse thumbnail strips stretch across the rail.
- Click next/previous and confirm screenshots cycle without hiding the tooltip.
- Hover a game with videos and confirm video items show as posters with a play affordance.
- Click a video poster and confirm the video loads only after the click.
- Confirm HLS-only Steam movie entries still appear as video thumbnails and show the Open on Steam fallback when inline playback is blocked.
- Navigate away from a video item and confirm playback stops.
- Hide the tooltip while a video is playing and confirm playback stops.
- Confirm the theatre button is hidden on the Steam header image.
- Open theatre from a screenshot and confirm it starts on that screenshot.
- Confirm screenshot theatre does not include the Steam header or navigable trailers.
- Confirm screenshot theatre counts hidden trailers in the footer index, matching Steam's `3 of N` behavior.
- Navigate screenshot theatre with buttons and keyboard arrows.
- Open theatre from a direct-file trailer and confirm the real video player appears immediately with custom controls.
- Confirm video theatre does not show enlarged low-resolution trailer thumbnails.
- Confirm video theatre can navigate from the launched trailer into screenshots, but not into other trailers.
- Confirm navigating from a trailer into screenshots removes the trailer from the theatre navigation loop.
- Confirm clicking outside the theatre modal closes it.
- Confirm clicking the active theatre video toggles play/pause.
- Confirm Left/Right keys seek the active theatre video instead of changing media.
- Confirm custom video controls show play/pause, mute, seek time, and video fullscreen controls.
- Toggle browser fullscreen from theatre mode and confirm Esc exits/closes cleanly.
- Toggle video fullscreen from the video controls when available.
- Close theatre mode and confirm video playback stops and page scrolling is restored.
- Confirm long thread status tags are bold and only truncate when the AppID row truly runs out of space.
- Hover cached data and confirm media renders without another Steam details request.
- Hover old cached data without `media` and confirm the header image fallback still works.
- Confirm failed lookup cards do not show carousel controls.
- Confirm AppID copy, SteamDB, Open on Steam, and Open Latest Page still work.

Regression checks:

- Tooltip positioning still works near viewport edges.
- Tooltip height does not jump when switching between header image, screenshot, and video poster.
- Long CS.RIN.RU thread tags still truncate cleanly.
- `node --check csrinruSteamHoverPreview.user.js` passes.
