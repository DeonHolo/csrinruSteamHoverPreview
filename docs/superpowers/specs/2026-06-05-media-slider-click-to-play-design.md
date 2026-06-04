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
- Show screenshots as images.
- Show videos as poster thumbnails with a play affordance.
- Replace a video poster with a playable video only after the user explicitly clicks it.
- Keep the existing title, release date, AppID, SteamDB, thread tags, description, rating, Steam tags/genres, and action links below the media.

Out of scope:

- Manual scraping for screenshots or videos.
- Autoplaying videos.
- Preloading video files before user interaction.
- Thumbnail strips in the first implementation.
- Fullscreen/lightbox media viewing.
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
  { type: "image", source: "screenshot", url, alt },
  { type: "video", source: "movie", posterUrl, videoUrl, alt }
]
```

The header image is always first when present. Screenshots follow. Videos come after screenshots so the first browsing experience stays fast and image-based.

Movie entries will prefer a web-compatible MP4 URL from Steam's movie data when available. If no playable MP4 exists, the implementation skips that movie item rather than adding a broken control.

## UX Design

Use an overlay-control carousel inside the existing top media area:

- The media frame keeps a fixed aspect ratio matching Steam header art.
- Left and right controls sit over the media edges.
- A small counter sits in the top-right corner, such as `1 / 7`, so it does not collide with native video controls.
- Video items show a centered play affordance over the poster.
- Clicking the poster/play affordance loads and plays the video.
- Clicking carousel arrows never opens Steam and never hides the tooltip.
- The default hover state still looks like today's preview: the header image is visible with no required interaction.

The UI will avoid a thumbnail strip for now because the tooltip is only about 320px wide and already contains dense metadata. The overlay controls preserve vertical space and make the feature discoverable without turning the card into a mini Steam page.

## Interaction Behavior

Carousel state is local to the currently rendered tooltip.

- On each new hover render, media index starts at `0`.
- Previous wraps from first item to last item.
- Next wraps from last item to first item.
- Arrow buttons use `button` elements with accessible labels.
- Keyboard focus must be possible for carousel buttons while the tooltip is interactive.
- Clicking a screenshot does nothing in this iteration.
- Clicking a video poster replaces it with a `video` element using `controls`, `autoplay`, and `playsinline`.
- Video loading starts only after that explicit click.
- Moving to another carousel item stops and removes the active video element.
- Hiding the tooltip stops and removes any active video element.

## Performance

The hover must stay fast:

- Do not make a second request just for media.
- Do not scrape the Steam store page for media.
- Do not preload video files.
- Do not eagerly create hidden video elements.
- Use image URLs from the Steam API response and let the browser load only the currently displayed media.
- Keep the media frame dimensions stable to avoid tooltip layout jumps.

Since media metadata comes from the same `appdetails` response already used for descriptions, release dates, and other details, the main new cost is rendering and loading the visible media asset.

## Caching

Media metadata is part of the successful Steam data object and follows the existing successful-cache TTL of 24 hours.

- If cached data has media, render the carousel immediately.
- If cached data predates this feature and has no normalized `media` array, fall back to `header_image`.
- Failed lookups still use the existing short failed-cache behavior.
- Clearing the hover cache clears media metadata too.

## Error Handling

- If `screenshots` or `movies` is missing, render only the header image.
- If no media is available, omit the media frame.
- If a screenshot fails to load, hide that image and continue showing the rest of the card.
- If a video fails to load, keep the poster visible and do not retry automatically.
- If a media URL is malformed, skip that item while normalizing media.
- If there is only one media item, hide carousel controls and counter.

## Code Organization

Add small helpers instead of folding the carousel into the existing render function:

- `normalizeSteamMedia(appData, appId)` returns media items.
- `renderMediaCarousel(media, title)` returns the media-frame HTML.
- `renderMediaItem(item, index, title)` returns image or video-poster HTML.
- `setActiveMedia(index)` updates the visible media item in the current tooltip.
- `stopActiveVideo()` stops/removes any active video when navigating or hiding.

Event handling stays delegated from the tooltip:

- `.mediaPrevBtn` decrements media index.
- `.mediaNextBtn` increments media index.
- `.mediaVideoPlayBtn` loads the selected video.
- Existing AppID copy behavior must remain independent.

## Testing

Manual checks:

- Hover a game with screenshots and confirm the header image is still first.
- Click next/previous and confirm screenshots cycle without hiding the tooltip.
- Hover a game with videos and confirm video items show as posters with a play affordance.
- Click a video poster and confirm the video loads only after the click.
- Navigate away from a video item and confirm playback stops.
- Hide the tooltip while a video is playing and confirm playback stops.
- Hover cached data and confirm media renders without another Steam details request.
- Hover old cached data without `media` and confirm the header image fallback still works.
- Confirm failed lookup cards do not show carousel controls.
- Confirm AppID copy, SteamDB, Open on Steam, and Open Latest Page still work.

Regression checks:

- Tooltip positioning still works near viewport edges.
- Tooltip height does not jump when switching between header image, screenshot, and video poster.
- Long CS.RIN.RU thread tags still truncate cleanly.
- `node --check csrinruSteamHoverPreview.user.js` passes.
