# CS.RIN.RU Steam Hover Preview

A userscript that displays Steam game information when hovering over game topic titles on CS.RIN.RU. Get instant access to Steam details and jump straight to the thread's latest page without leaving the forum list!

<center>
  <img
    src="https://i.imgur.com/3Mk3DwN.png"
    alt="Hover preview demo"
    style="max-width:100%; margin:8px 0;"
  />
</center>

## Features

- **🖼️ Game Thumbnail** - Steam header image displayed in tooltip
- **📝 Description** - Short game description from Steam
- **⭐ Steam Ratings** - Visual star rating with review summary and count
- **🏷️ User-Defined Tags** - Actual Steam community tags (Survival Horror, RPG, etc.)
- **📅 Release Date** - Game release information
- **🎮 Open on Steam** - Direct link to Steam store page
- **↗️ Open Latest Page** - Opens the latest page of the CS.RIN.RU topic, where new links and updates are usually posted
- **🧹 Topic Cleanup** - Cleans forum title tags like `[Info]`, `[CRACKED]`, `[NOT CRACKED]`, build/update labels, and platform notes before searching Steam
- **🎯 Base Game Matching** - Prefers base-game Steam results over DLC, upgrades, season passes, and store extras
- **⚡ Smart Caching** - Persistent cache across sessions (24hr TTL) and short failed-lookup cache (15min TTL)
- **🔄 Background Preloading** - Preloads game data when the tab is idle

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [Greasemonkey](https://www.greasespot.net/)

2. Install the script:
   - Install from Greasy Fork when published
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
5. Displays a tooltip with Steam information
6. Use `🎮 Open on Steam` or `↗️ Open Latest Page` from the hover preview

## Technical Details

- **API Used**: Steam Store API + Steam Store Page scraping
- **Cache Duration**: 24 hours for successful Steam data / 15 minutes for failed lookups
- **Rate Limiting**: 50ms minimum between API requests
- **Preloading**: Concurrent fetching when tab is hidden
- **Forum Filtering**: Only activates under the `Topics` section, skipping announcements and stickies

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**DeonHolo**
- [Greasy Fork Profile](https://greasyfork.org/en/users/1340389-deonholo)
- [GitHub](https://github.com/DeonHolo)
