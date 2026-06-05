# ![Icon of CS.RIN.RU](https://i.ibb.co/zXtW7WD/csrinfavicon32.png) CS.RIN.RU Steam Hover Preview

A userscript that displays Steam game information when hovering over game topic titles on CS.RIN.RU. Get Steam media, ratings, tags, AppID tools, SteamDB links, and latest-thread actions without leaving the forum list.

<center>
  <img
    src="https://i.imgur.com/LdBNWBS.png"
    alt="Hover preview demo"
    style="max-width:100%; margin:8px 0;"
  />
</center>

## Features

- **Steam Media Carousel** - Steam header image first, with screenshots and click-to-play videos when available
- **Thumbnail Strip** - Quickly jump between available Steam media without leaving the hover card
- **Theatre Mode** - Open screenshots and trailers in a larger Steam-style media viewer with navigation, video controls, and fullscreen support
- **Theatre Footer Actions** - Open the Steam page or the CS.RIN.RU topic's latest page directly from theatre mode
- **Description** - Short game description from Steam
- **Steam Ratings** - Visual star rating with review summary and count
- **User-Defined Tags** - Actual Steam community tags from the Steam store page when available, with genres as fallback
- **Release Date** - Game release information
- **AppID Utility** - Click the Steam AppID to copy it, or use the compact external link to open SteamDB
- **CS.RIN Thread Tags** - Shows bracketed topic tags in the hover card with OG CS.RIN.RU Enhanced-style colors
- **Open on Steam** - Direct link to the Steam store page from the hover card and theatre footer
- **Open Latest Page** - Opens the latest page of the CS.RIN.RU topic, where new links and updates are usually posted
- **Topic Cleanup** - Cleans forum title tags like `[Info]`, `[CRACKED]`, `[NOT CRACKED]`, build/update labels, and platform notes before searching Steam
- **Base Game Matching** - Prefers base-game Steam results over DLC, upgrades, season passes, and store extras
- **Smart Caching** - Persistent cache across sessions (24hr TTL), including media metadata, plus short failed-lookup caching
- **Background Preloading** - Preloads game data when the tab is idle

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [Greasemonkey](https://www.greasespot.net/)

2. Install the script:
   - **[Install from Greasy Fork](https://greasyfork.org/en/scripts/580613-cs-rin-ru-steam-hover-preview)** (Recommended)
   - Or copy `csrinruSteamHoverPreview.user.js` manually from this repo

## Supported Sites

The script works on CS.RIN.RU forum pages:

- `cs.rin.ru/forum/*`
- `*.cs.rin.ru/forum/*`

## How It Works

1. Navigate to a CS.RIN.RU forum topic list
2. Hover over a game topic title in the `Topics` section
3. The script extracts and cleans the game name from the topic title
4. Searches Steam for a matching base game
5. Displays a tooltip with Steam information and browsable media when available
6. Copy the AppID, open SteamDB, open theatre mode, or use `Open on Steam` / `Open Latest Page`

## Technical Details

- **API Used**: Steam Store API + Steam Store Page scraping
- **Cache Duration**: 24 hours for successful Steam data / 15 minutes for failed lookups
- **Rate Limiting**: 50ms minimum between API requests
- **Preloading**: Concurrent fetching when tab is hidden
- **Forum Filtering**: Only activates under the `Topics` section, skipping announcements and stickies
- **Media Handling**: Stores normalized Steam screenshots/trailers in cache and reuses them across hover and theatre views

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**DeonHolo**

- [Greasy Fork Profile](https://greasyfork.org/en/users/1340389-deonholo)
- [GitHub](https://github.com/DeonHolo)
