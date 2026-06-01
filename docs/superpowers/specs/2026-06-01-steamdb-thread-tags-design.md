# SteamDB AppID Link and Thread Tags Design

## Context

The current userscript is intentionally focused: hover over a CS.RIN.RU topic title and show a compact Steam preview with actions for Steam and the latest forum page. Version 1.3.0 added a clickable AppID line that copies the Steam AppID.

This design adds two small power-user affordances without turning the script into a general CS.RIN.RU Enhanced replacement:

- Add a SteamDB outbound link beside the AppID.
- Show CS.RIN.RU thread status tags in the hover card using the original CS.RIN.RU Enhanced tag-coloring style.

The original CS.RIN.RU Enhanced script colors bracketed tags with a deterministic text-to-color function. This script will adapt that idea as a visible tribute while keeping the behavior scoped to the hover card.

## Scope

In scope:

- Extract bracketed thread tags from the original forum topic title, such as `[Info]`, `[CRACKED]`, `[Pre-Release]`, `[Early Access]`, and `[NOT CRACKED / HYPERVISOR]`.
- Render those tags inside the hover card on the same compact metadata row as the AppID when space allows.
- Keep the AppID itself clickable for copy-to-clipboard.
- Add a small clickable outbound affordance beside the AppID that opens SteamDB for the matched app.
- Use deterministic OG-style tag colors based on the tag text.
- Credit the inspiration in a short code comment or README note if the implementation uses a visibly similar algorithm.

Out of scope:

- Re-coloring topic titles in the forum list by default, to avoid duplicating the OG script for users who already run it.
- Building a full settings/config window in this iteration.
- Adding general forum helpers such as infinite scrolling, unread-click routing, post preview, SCS filtering, or shoutbox features.

## UX Design

The AppID metadata row will become a flexible utility row:

```txt
AppID: 123456 [external-link]        [CRACKED] [Early Access]
```

The `123456` button keeps the existing copy behavior. The small external-link control opens `https://steamdb.info/app/<appid>/` in a new tab. It will be visually close to the AppID so users understand it belongs to the same identifier, but it will have its own title/aria-label such as `Open SteamDB`.

Thread tags will sit on the opposite side of the same row when there is room. The row will wrap on narrow cards or long tag values. If there is no AppID, tags can still render as a compact metadata row without a `Thread:` label.

The hover card will not duplicate noisy label text. The tags themselves carry enough meaning, and labels would consume too much width.

## Tag Color Rules

Tags are extracted from the raw CS.RIN.RU topic title before cleanup. Each complete bracketed token is colorized independently.

The color generator will match the original CS.RIN.RU Enhanced algorithm:

- Convert tag text to lowercase.
- Hash the text deterministically.
- Derive a hex color from the hash.
- Use the same color for the brackets and inner text.
- Slightly reduce inner text size only if needed to match the OG visual style.

Example expected colors from the OG algorithm:

- `[Info]` -> blue
- `[CRACKED]` -> red/pink
- `[Pre-Release]` and `[Early Access]` -> yellow-green
- `[NOT CRACKED / HYPERVISOR]` -> blue/purple

The implementation will not add contrast adjustment in this iteration, because the goal is recognizable OG-style color parity.

## Architecture

Add small parsing/rendering helpers near the existing topic-info and rendering helpers:

- `extractThreadTags(rawTitle)` returns an ordered, de-duplicated list of bracketed tags.
- `colorizeThreadTag(tag)` returns an OG-style deterministic color.
- `renderThreadTags(tags)` returns escaped tag HTML with inline or CSS-variable colors.
- `getSteamDbUrl(appId)` returns the SteamDB URL or an empty string.

Extend `getTopicInfo(link)` to include `threadTags`, derived from `rawTitle`. Keep `cleanName(rawTitle)` unchanged so Steam matching behavior remains stable.

Extend `renderSteamData(data, gameName, topicInfo)` to render the new utility metadata row. The existing AppID copy listener can remain event-delegated on the tooltip. SteamDB will be a normal anchor and will not trigger copy behavior.

## Error Handling

- If no AppID exists, do not render a SteamDB link.
- If no thread tags exist, do not render a tag container.
- If copying fails, keep the current prompt fallback.
- If a tag color cannot be generated for any unexpected reason, fall back to the tooltip text color rather than hiding the tag.
- If a very long tag appears, allow wrapping inside the metadata row instead of overflowing the tooltip.

## Testing

Manual checks:

- Hover a topic with `[Info]` and no status tag.
- Hover a topic with `[CRACKED]`, `[Pre-Release]`, or `[Early Access]`.
- Hover a topic with a long status tag such as `[NOT CRACKED / HYPERVISOR]`.
- Click the AppID and confirm it still copies.
- Click the SteamDB affordance and confirm it opens `https://steamdb.info/app/<appid>/`.
- Confirm clicking SteamDB does not trigger AppID copy feedback.
- Confirm no extra tag line appears for titles without bracketed tags.
- Confirm the hover card wraps cleanly at its current `max-width`.

Regression checks:

- Existing Steam image, release date, description, rating, tags/genres, Open on Steam, and Open Latest Page still render.
- Failed Steam lookup cards do not show an AppID or SteamDB link.
- Steam matching remains based on the cleaned game name, not the colored/rendered tag HTML.
