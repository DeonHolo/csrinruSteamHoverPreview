// ==UserScript==
// @name         CS.RIN.RU - Steam Hover Preview
// @namespace    https://greasyfork.org/en/users/1340389-deonholo
// @version      1.2.0
// @description  On-hover Steam thumbnail, description, Steam ratings, tags, release date, Open on Steam, and Open Latest Page for cs.rin.ru forum topics
// @author       DeonHolo
// @license      MIT
// @match        *://cs.rin.ru/forum/*
// @match        *://*.cs.rin.ru/forum/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      store.steampowered.com
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const TOPIC_SELECTOR = 'a.topictitle, a[href*="viewtopic.php"][href*="t="]';
    const MIN_INTERVAL = 50;
    const MAX_CACHE = 120;
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    const MEMORY_CACHE_TTL = 15 * 60 * 1000;
    const HIDE_DELAY = 100;
    const FADE_DURATION = 180;
    const API_TIMEOUT = 8000;
    const STORAGE_KEY = 'csrinruSteamHoverCache_v1';
    const CONCURRENT_VISIBLE = 3;
    const CONCURRENT_HIDDEN = 4;
    const PRIORITY_PRELOAD_COUNT = 15;
    const CONCURRENT_TAG_VISIBLE = 1;
    const CONCURRENT_TAG_HIDDEN = 3;
    const MAX_SEARCH_CANDIDATES = 5;
    const DEBUG_MODE = false;

    const tip = document.createElement('div');
    tip.className = 'csrinruSteamHoverTip';

    let lastRequest = 0;
    let requestGate = Promise.resolve();
    let hoverId = 0;
    let showTimeout = null;
    let hideTimeout = null;
    let displayTimeout = null;
    let trackingMove = false;
    let lastMoveEvent = null;
    let currentHoveredLink = null;
    let userHovering = false;
    let isPageHidden = document.hidden || false;

    const apiCache = new Map();
    const inFlightFetches = new Map();
    const inFlightTagFetches = new Map();

    function debugLog(...args) {
        if (DEBUG_MODE) console.log('[CS.RIN.RU Steam Hover]', ...args);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function absoluteUrl(href) {
        try {
            return new URL(href, window.location.href).href;
        } catch (_) {
            return href || '';
        }
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getTopicId(href) {
        try {
            return new URL(href, window.location.href).searchParams.get('t');
        } catch (_) {
            return null;
        }
    }

    function loadPersistentCache() {
        try {
            const stored = GM_getValue(STORAGE_KEY, null);
            if (!stored) return;

            const parsed = JSON.parse(stored);
            const now = Date.now();
            let loaded = 0;
            for (const [key, value] of Object.entries(parsed)) {
                if (value.data && value.ts && (now - value.ts) < CACHE_TTL) {
                    apiCache.set(key, value);
                    loaded++;
                }
            }
            debugLog(`Loaded ${loaded} cached games from storage`);
        } catch (e) {
            console.warn('[CS.RIN.RU Steam Hover] Failed to load cache:', e);
        }
    }

    let saveTimeout = null;
    function savePersistentCache() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            try {
                const obj = {};
                const now = Date.now();
                for (const [key, value] of apiCache.entries()) {
                    if (value.data && value.ts && (now - value.ts) < CACHE_TTL) {
                        obj[key] = value;
                    }
                }
                GM_setValue(STORAGE_KEY, JSON.stringify(obj));
            } catch (e) {
                console.warn('[CS.RIN.RU Steam Hover] Failed to save cache:', e);
            }
        }, 1000);
    }

    function pruneCache(map) {
        while (map.size > MAX_CACHE) {
            map.delete(map.keys().next().value);
        }
    }

    function getFreshCacheEntry(name, now = Date.now()) {
        const hit = apiCache.get(name);
        if (!hit) return null;

        if (now - hit.ts < (hit.data ? CACHE_TTL : MEMORY_CACHE_TTL)) {
            return hit;
        }

        apiCache.delete(name);
        return null;
    }

    window.clearCsrinruSteamHoverCache = function () {
        apiCache.clear();
        inFlightFetches.clear();
        inFlightTagFetches.clear();
        GM_setValue(STORAGE_KEY, '{}');
        console.log('[CS.RIN.RU Steam Hover] Cache cleared. Refresh the page to re-fetch games.');
    };

    GM_addStyle(`
        .csrinruSteamHoverTip {
            position: absolute;
            display: none;
            opacity: 0;
            max-width: 320px;
            padding: 8px;
            background: rgba(28, 28, 28, 0.98);
            border: 1px solid #5c5c5c;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
            color: #c1cccc;
            font-size: 12px;
            line-height: 1.45;
            white-space: normal !important;
            overflow-wrap: break-word;
            z-index: 2147483647;
            pointer-events: none;
            transition: opacity ${FADE_DURATION}ms ease-in-out;
        }
        .csrinruSteamHoverTip p {
            margin: 0 0 5px 0;
            padding: 0;
        }
        .csrinruSteamHoverTip p:last-child {
            margin-bottom: 0;
        }
        .csrinruSteamHoverTip img {
            display: block;
            width: 100%;
            margin-bottom: 8px;
            border-radius: 2px;
        }
        .csrinruSteamHoverTip strong {
            color: #f2f2f2;
        }
        .csrinruSteamHoverTip a,
        .csrinruSteamHoverTip a:visited {
            color: #99d2f7 !important;
            text-decoration: underline;
            cursor: pointer;
        }
        .csrinruSteamHoverTip a:hover,
        .csrinruSteamHoverTip a:visited:hover {
            color: #c7ebff !important;
        }
        .csrinruSteamHoverTip .steamRating,
        .csrinruSteamHoverTip .steamTags,
        .csrinruSteamHoverTip .steamReleaseDate {
            margin-top: 8px;
            font-size: 12px;
            color: #c1cccc;
        }
        .csrinruSteamHoverTip .steamReleaseDate {
            margin-top: 2px;
            font-size: 11px;
            color: #a8b4b8;
        }
        .csrinruSteamHoverTip .ratingStars {
            color: #f5c518;
            margin-right: 6px;
            letter-spacing: 1px;
            font-size: 14px;
            display: inline-block;
            vertical-align: middle;
        }
        .csrinruSteamHoverTip .ratingText {
            vertical-align: middle;
        }
        .csrinruSteamHoverTip .loadingContainer {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .csrinruSteamHoverTip .spinner {
            width: 18px;
            height: 18px;
            border: 2px solid #3a3a3a;
            border-top-color: #99d2f7;
            border-radius: 50%;
            animation: csrinruSteamSpinner 0.8s linear infinite;
            flex-shrink: 0;
        }
        @keyframes csrinruSteamSpinner {
            to { transform: rotate(360deg); }
        }
        .csrinruSteamHoverTip .tipActions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
            margin-top: 8px;
            padding-top: 2px;
            border-top: none;
        }
    `);

    loadPersistentCache();
    document.body.appendChild(tip);

    document.addEventListener('visibilitychange', () => {
        isPageHidden = document.hidden;
    });

    function isProbablyTopicTitleLink(link) {
        if (!link) return false;

        const href = link.getAttribute('href') || '';
        if (!/viewtopic\.php/i.test(href)) return false;

        const text = link.textContent.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2) return false;
        if (/^\d+$/.test(text)) return false;
        if (/^(next|previous|last|first)$/i.test(text)) return false;

        const topicId = getTopicId(href);
        if (!topicId) return false;

        if (link.closest('.pagination')) return false;
        if (/\b(go to page|page)\b/i.test(link.parentElement?.textContent || '') && /^\d+$/.test(text)) return false;

        return true;
    }

    function getTopicRow(link) {
        return link.closest('tr') || link.closest('li') || link.closest('.row') || link.parentElement;
    }

    let hasTopicsSectionCache = null;
    function rowSectionName(row) {
        const text = row?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
        if (text === 'topics') return 'topics';
        if (text === 'announcements') return 'announcements';
        if (text === 'stickies') return 'stickies';
        return null;
    }

    function pageHasTopicsSection() {
        if (hasTopicsSectionCache !== null) return hasTopicsSectionCache;

        hasTopicsSectionCache = Array.from(document.querySelectorAll('tr, .row'))
            .some(row => rowSectionName(row) === 'topics');
        return hasTopicsSectionCache;
    }

    function getPreviousSectionName(row) {
        let current = row;
        while (current && current.previousElementSibling) {
            current = current.previousElementSibling;
            const sectionName = rowSectionName(current);
            if (sectionName) return sectionName;
        }
        return null;
    }

    function isInTopicsSection(row) {
        if (!pageHasTopicsSection()) return true;
        return getPreviousSectionName(row) === 'topics';
    }

    function getLatestPageUrl(link, row) {
        const topicUrl = absoluteUrl(link.getAttribute('href'));
        const topicId = getTopicId(topicUrl);
        if (!row || !topicId) return topicUrl;

        const rowLinks = Array.from(row.querySelectorAll('a[href*="viewtopic.php"]'));
        const pageLinks = rowLinks.filter((a) => {
            const text = a.textContent.trim();
            return /^\d+$/.test(text) && getTopicId(a.getAttribute('href')) === topicId;
        });

        if (pageLinks.length) {
            return absoluteUrl(pageLinks[pageLinks.length - 1].getAttribute('href'));
        }

        const latestPostLinks = rowLinks.filter((a) => {
            const href = absoluteUrl(a.getAttribute('href'));
            return /[?&]p=\d+|#p\d+/i.test(href);
        });

        if (latestPostLinks.length) {
            return absoluteUrl(latestPostLinks[latestPostLinks.length - 1].getAttribute('href'));
        }

        return topicUrl;
    }

    function cleanName(raw) {
        if (!raw) return null;

        let name = raw.replace(/\s+/g, ' ').trim();

        if (/\b(best practices|release requirements|windows security|manifest generator|dbcode generator|rules|faq|tutorial|guide|index)\b/i.test(name)) {
            return null;
        }

        name = name.replace(/^\s*(?:\[[^\]]+\]\s*)+/g, '');
        name = name.replace(/\[[^\]]*(?:info|request|steam|gog|epic|cracked|not cracked|hypervisor|early access|playable|build|update|linux|mac|windows|goldberg|rune|tenoke|flt|skidrow|codex)[^\]]*\]/gi, ' ');
        name = name.replace(/\s+MOD\s+TOPIC\b.*$/i, '');
        name = name.replace(/\((?:[^)]*(?:request and share|build|update|crack|cracked|not cracked|multi\d*|dlc|language|windows|linux|mac)[^)]*)\)/gi, ' ');
        name = name.replace(/\b(NOT\s+CRACKED|HYPERVISOR|CRACKED|EARLY\s+ACCESS|PLAYABLE)\b/gi, ' ');
        name = name.replace(/[._]/g, ' ');
        name = name.replace(/\s+(x64|x86|64bit|32bit|64-bit|32-bit)\b/gi, '');
        name = name.replace(/\s+MULTI\d*\b/gi, '');
        name = name.replace(/\s+(incl|incl\.|including)\s+.*/gi, '');
        name = name.replace(/\b(Update|Build|Hotfix|Patch)\b.*$/i, '');
        name = name.replace(/\bv\d[\d.]*.*$/i, '');
        name = name.replace(/\s{2,}/g, ' ').trim();

        return name.length >= 2 ? name : null;
    }

    function getTopicInfo(link) {
        if (!isProbablyTopicTitleLink(link)) return null;

        const rawTitle = link.textContent.replace(/\s+/g, ' ').trim();
        const gameName = cleanName(rawTitle);
        if (!gameName) return null;

        const row = getTopicRow(link);
        if (!isInTopicsSection(row)) return null;

        const topicUrl = absoluteUrl(link.getAttribute('href'));
        const latestUrl = getLatestPageUrl(link, row);

        return { link, row, rawTitle, gameName, topicUrl, latestUrl };
    }

    async function waitForRequestSlot() {
        const wait = Math.max(0, MIN_INTERVAL - (Date.now() - lastRequest));
        if (wait) await delay(wait);
        lastRequest = Date.now();
    }

    function gmFetch(url, responseType = 'json', timeout = API_TIMEOUT) {
        const slot = requestGate.then(waitForRequestSlot, waitForRequestSlot);
        requestGate = slot.catch(() => null);

        return slot
            .then(() => new Promise((resolve, reject) => {
                lastRequest = Date.now();
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType,
                    timeout,
                    headers: {
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cookie': 'birthtime=0; mature_content=1; wants_mature_content=1; lastagecheckage=1-0-1990'
                    },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            if (responseType === 'json') {
                                if (typeof res.response === 'object' && res.response !== null) {
                                    resolve(res.response);
                                } else {
                                    try {
                                        resolve(JSON.parse(res.responseText));
                                    } catch (_) {
                                        reject(new Error(`JSON parse error for ${url}`));
                                    }
                                }
                            } else {
                                resolve(res.response || res.responseText);
                            }
                        } else {
                            reject(new Error(`HTTP ${res.status} for ${url}`));
                        }
                    },
                    onerror: () => reject(new Error(`Network error for ${url}`)),
                    ontimeout: () => reject(new Error(`Timeout ${timeout}ms for ${url}`)),
                    onabort: () => reject(new Error(`Aborted request for ${url}`))
                });
            }));
    }

    function stripEditionSuffixForSearch(name) {
        return name
            .replace(/\s*[:\-]\s*(Digital\s+Deluxe|Deluxe|Ultimate|Gold|Premium|Collector'?s)\s+Edition\b.*$/i, '')
            .replace(/\s+(Digital\s+Deluxe|Deluxe|Ultimate|Gold|Premium|Collector'?s)\s+Edition\b.*$/i, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    async function fetchSteamWithFallback(originalName) {
        const words = originalName.split(/\s+/);
        const attempts = [];
        const baseName = stripEditionSuffixForSearch(originalName);

        if (baseName && baseName.toLowerCase() !== originalName.toLowerCase()) {
            attempts.push(baseName);
        }

        attempts.push(originalName);

        const maxAttempts = Math.min(words.length, 4);
        for (let i = 0; i < maxAttempts; i++) {
            const tryName = words.slice(0, words.length - i).join(' ');
            if (tryName.length >= 2) attempts.push(tryName);
        }

        for (const tryName of [...new Set(attempts)]) {
            const result = await fetchSteam(tryName);
            if (result) return result;
        }

        return null;
    }

    async function fetchAppDetailsForIds(appIds) {
        const ids = [...new Set(appIds.filter(Boolean))].slice(0, MAX_SEARCH_CANDIDATES);
        if (!ids.length) return {};

        const batchUrl = `https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&cc=us&l=en`;
        try {
            return await gmFetch(batchUrl, 'json');
        } catch (_) {
            const details = {};
            for (const id of ids) {
                const singleUrl = `https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=en`;
                const singleRes = await gmFetch(singleUrl, 'json').catch(() => null);
                if (singleRes?.[id]) details[id] = singleRes[id];
            }
            return details;
        }
    }

    function getReviewInfo(reviewRes) {
        if (!reviewRes?.success || !reviewRes.query_summary) return null;

        const summary = reviewRes.query_summary;
        const percent = summary.total_reviews ? Math.round((summary.total_positive / summary.total_reviews) * 100) : null;
        return {
            desc: summary.review_score_desc || 'No Reviews',
            percent,
            total: summary.total_reviews || 0
        };
    }

    function getGenreTags(appData) {
        return (appData?.genres || [])
            .map(genre => genre.description)
            .filter(Boolean)
            .slice(0, 5);
    }

    function getTagSource(data) {
        if (data?.tagsSource) return data.tagsSource;
        return data?.tags?.length ? 'steam' : 'genres';
    }

    function updateCachedDataForApp(appId, updater) {
        let updated = false;
        const now = Date.now();

        for (const [key, value] of apiCache.entries()) {
            if (value.data?.appId !== appId) continue;

            apiCache.set(key, {
                ...value,
                data: updater(value.data, now),
                ts: now
            });
            updated = true;
        }

        if (updated) savePersistentCache();
    }

    async function fetchSteamTags(appId) {
        const storeHtml = await gmFetch(`https://store.steampowered.com/app/${appId}/`, 'text');
        if (!storeHtml) return [];

        const doc = new DOMParser().parseFromString(storeHtml, 'text/html');
        return Array.from(doc.querySelectorAll('a.app_tag'))
            .map(el => el.textContent.trim())
            .filter(tag => tag && tag !== '+')
            .slice(0, 5);
    }

    function warmSteamTags(data) {
        if (!data?.appId) return null;
        if (getTagSource(data) === 'steam') return null;
        if (data.steamTagsAttemptTs && Date.now() - data.steamTagsAttemptTs < MEMORY_CACHE_TTL) return null;

        const inFlight = inFlightTagFetches.get(data.appId);
        if (inFlight) return inFlight;

        updateCachedDataForApp(data.appId, (cachedData, now) => ({
            ...cachedData,
            steamTagsAttemptTs: now
        }));

        const request = fetchSteamTags(data.appId)
            .then(tags => {
                if (!tags.length) return;

                updateCachedDataForApp(data.appId, (cachedData, now) => ({
                    ...cachedData,
                    tags,
                    tagsSource: 'steam',
                    steamTagsAttemptTs: now
                }));
            })
            .catch(() => null)
            .finally(() => inFlightTagFetches.delete(data.appId));

        inFlightTagFetches.set(data.appId, request);
        return request;
    }

    function normalizeForMatch(value) {
        return String(value ?? '')
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[®™©]/g, '')
            .replace(/['’]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getBaseMatchName(value) {
        return normalizeForMatch(stripEditionSuffixForSearch(value));
    }

    function hasDlcNameMarker(item, data) {
        const type = normalizeForMatch(data?.type);
        const name = normalizeForMatch(`${item?.name || ''} ${data?.name || ''}`);

        return type === 'dlc' ||
            /\b(dlc|upgrade|season pass|expansion pass|soundtrack|ost|artbook|skin pack|costume pack|weapon pack|bonus content)\b/.test(name);
    }

    function getTokenOverlapScore(baseName, candidateName) {
        const tokens = baseName.split(' ').filter(token => token.length > 1);
        if (!tokens.length) return 0;

        const candidateTokens = new Set(candidateName.split(' '));
        const matches = tokens.filter(token => candidateTokens.has(token)).length;
        return matches / tokens.length;
    }

    function scoreSearchCandidate(searchName, candidate, index) {
        const itemName = candidate.item?.name || '';
        const dataName = candidate.data?.name || itemName;
        const candidateName = normalizeForMatch(dataName);
        const itemMatchName = normalizeForMatch(itemName);
        const searchMatchName = normalizeForMatch(searchName);
        const baseMatchName = getBaseMatchName(searchName);
        const type = normalizeForMatch(candidate.data?.type);

        let score = 100 - index;

        if (type === 'game') score += 40;
        else if (type) score -= 120;

        if (candidateName === searchMatchName || itemMatchName === searchMatchName) score += 35;
        if (baseMatchName && (candidateName === baseMatchName || itemMatchName === baseMatchName)) score += 120;
        if (baseMatchName && (candidateName.startsWith(baseMatchName) || itemMatchName.startsWith(baseMatchName))) score += 35;
        if (baseMatchName) score += Math.round(getTokenOverlapScore(baseMatchName, candidateName) * 50);
        if (hasDlcNameMarker(candidate.item, candidate.data)) score -= 170;

        return score;
    }

    async function fetchSteam(name) {
        const now = Date.now();
        const hit = getFreshCacheEntry(name, now);
        if (hit) {
            return hit.data;
        }

        const inFlight = inFlightFetches.get(name);
        if (inFlight) return inFlight;

        const request = fetchSteamUncached(name, now)
            .finally(() => inFlightFetches.delete(name));
        inFlightFetches.set(name, request);
        return request;
    }

    async function fetchSteamUncached(name, now) {
        let appId = null;
        let appData = null;
        let reviewInfo = null;

        try {
            const searchUrl = `https://store.steampowered.com/api/storesearch/?cc=us&l=en&term=${encodeURIComponent(name)}`;
            const searchRes = await gmFetch(searchUrl, 'json');
            const items = searchRes?.items || [];
            if (!items.length) throw new Error('No suitable AppID found in search results.');

            const exactMatches = items.filter(item => item.name?.toLowerCase() === name.toLowerCase());
            const orderedCandidates = [];
            const seenIds = new Set();
            for (const item of [...exactMatches, ...items]) {
                if (!item?.id || seenIds.has(item.id)) continue;
                orderedCandidates.push(item);
                seenIds.add(item.id);
                if (orderedCandidates.length >= MAX_SEARCH_CANDIDATES) break;
            }

            const detailsRes = await fetchAppDetailsForIds(orderedCandidates.map(item => item.id));
            const enriched = orderedCandidates.map(item => ({
                item,
                data: detailsRes?.[item.id]?.success ? detailsRes[item.id].data : null
            }));

            const scoredCandidates = enriched
                .map((candidate, index) => ({
                    ...candidate,
                    score: scoreSearchCandidate(name, candidate, index)
                }))
                .sort((a, b) => b.score - a.score);

            const result = scoredCandidates[0] || { item: orderedCandidates[0], data: null };
            appId = result.item?.id;
            appData = result.data;

            if (appData?.type && appData.type !== 'game') {
                const mainGame = enriched.find(candidate => candidate.data?.type === 'game');
                if (mainGame) {
                    appId = mainGame.item.id;
                    appData = mainGame.data;
                }
            }

            if (!appId) throw new Error('No suitable AppID found in search results.');
        } catch (err) {
            console.warn(`[CS.RIN.RU Steam Hover] Steam search failed for "${name}":`, err.message);
            apiCache.set(name, { data: null, ts: now });
            pruneCache(apiCache);
            return null;
        }

        try {
            const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=en`;
            const reviewUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&filter=summary`;

            if (appData) {
                const reviewRes = await gmFetch(reviewUrl, 'json').catch(() => null);
                reviewInfo = getReviewInfo(reviewRes);
            } else {
                const [detailsRes, reviewRes] = await Promise.all([
                    gmFetch(detailsUrl, 'json').catch(() => null),
                    gmFetch(reviewUrl, 'json').catch(() => null)
                ]);

                if (detailsRes?.[appId]?.success) {
                    appData = detailsRes[appId].data;
                } else {
                    throw new Error('Failed to fetch app details.');
                }

                reviewInfo = getReviewInfo(reviewRes);
            }
        } catch (err) {
            console.warn(`[CS.RIN.RU Steam Hover] Steam details/reviews failed for ${appId}:`, err.message);
            if (!appData) {
                apiCache.set(name, { data: null, ts: now });
                pruneCache(apiCache);
                return null;
            }
        }

        const tags = getGenreTags(appData);

        const data = {
            ...appData,
            appId,
            tags,
            tagsSource: 'genres',
            reviewInfo,
            releaseDate: appData.release_date?.date || null,
            storeUrl: `https://store.steampowered.com/app/${appId}/`
        };

        apiCache.set(name, { data, ts: now });
        pruneCache(apiCache);
        savePersistentCache();
        return data;
    }

    function getRatingStars(percent, desc) {
        const filled = '★';
        const empty = '☆';
        const p = parseInt(percent, 10);
        let stars = '';

        if (!isNaN(p)) {
            if (p >= 95) stars = filled.repeat(5);
            else if (p >= 80) stars = filled.repeat(4) + empty;
            else if (p >= 70) stars = filled.repeat(3) + empty.repeat(2);
            else if (p >= 40) stars = filled.repeat(2) + empty.repeat(3);
            else if (p >= 20) stars = filled + empty.repeat(4);
            else stars = empty.repeat(5);
        } else if (desc) {
            const d = desc.toLowerCase();
            if (d.includes('overwhelmingly positive')) stars = filled.repeat(5);
            else if (d.includes('very positive')) stars = filled.repeat(4) + empty;
            else if (d.includes('mostly positive')) stars = filled.repeat(4) + empty;
            else if (d.includes('positive')) stars = filled.repeat(4) + empty;
            else if (d.includes('mixed')) stars = filled.repeat(3) + empty.repeat(2);
            else if (d.includes('mostly negative')) stars = filled.repeat(2) + empty.repeat(3);
            else if (d.includes('negative')) stars = filled + empty.repeat(4);
        }

        return stars ? `<span class="ratingStars">${stars}</span>` : '';
    }

    function positionTip(ev) {
        let x = ev.pageX + 15;
        let y = ev.pageY + 15;
        const tipWidth = tip.offsetWidth;
        const tipHeight = tip.offsetHeight;
        const margin = 10;
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;

        if (x + tipWidth + margin > scrollX + viewWidth) {
            x = Math.max(scrollX + margin, ev.pageX - tipWidth - 15);
        }
        if (y + tipHeight + margin > scrollY + viewHeight) {
            const yAbove = ev.pageY - tipHeight - 15;
            y = yAbove > scrollY + margin ? yAbove : scrollY + viewHeight - tipHeight - margin;
        }

        tip.style.left = `${Math.max(scrollX + margin, x)}px`;
        tip.style.top = `${Math.max(scrollY + margin, y)}px`;
    }

    function startHideAnimation() {
        if (tip.style.display !== 'none') {
            tip.style.opacity = '0';
            tip.style.pointerEvents = 'none';
            trackingMove = false;
            clearTimeout(displayTimeout);
            displayTimeout = setTimeout(() => {
                tip.style.display = 'none';
            }, FADE_DURATION);
        }
    }

    function scheduleHideTip() {
        clearTimeout(hideTimeout);
        clearTimeout(displayTimeout);
        hideTimeout = setTimeout(() => {
            hoverId++;
            currentHoveredLink = null;
            startHideAnimation();
        }, HIDE_DELAY);
    }

    function cancelHideTip() {
        clearTimeout(hideTimeout);
        clearTimeout(displayTimeout);
        if (tip.style.display === 'block' && tip.style.opacity === '0') {
            tip.style.opacity = '1';
            tip.style.pointerEvents = 'auto';
        }
    }

    function renderLoading(event, gameName) {
        tip.innerHTML = `<div class="loadingContainer"><div class="spinner"></div><span>Loading <strong>${escapeHtml(gameName)}</strong>…</span></div>`;
        positionTip(event);
        tip.style.display = 'block';
        void tip.offsetHeight;
        tip.style.opacity = '1';
        tip.style.pointerEvents = 'auto';
    }

    function renderNoData(gameName, topicInfo) {
        const searchUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`;
        tip.innerHTML = `
            <p>No Steam info found for<br><strong>${escapeHtml(gameName)}</strong></p>
            <div class="tipActions">
                <a href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener noreferrer">🎮 Open on Steam</a>
                <a href="${escapeHtml(topicInfo.latestUrl)}" target="_blank" rel="noopener noreferrer">↗️ Open Latest Page</a>
            </div>
        `;
    }

    function renderSteamData(data, gameName, topicInfo) {
        const title = escapeHtml(data.name || gameName);
        const headerImage = escapeHtml(data.header_image || '');
        const shortDescription = escapeHtml(data.short_description || 'No description available.');
        const releaseDate = escapeHtml(data.releaseDate || '');
        const storeUrl = escapeHtml(data.storeUrl || `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`);
        const latestUrl = escapeHtml(topicInfo.latestUrl);
        const tagLabel = getTagSource(data) === 'steam' ? 'Tags' : 'Genres';
        const tagsHtml = data.tags?.length ?
            `<p class="steamTags"><strong>${tagLabel}:</strong> ${data.tags.map(escapeHtml).join(' • ')}</p>` :
            '';
        const reviewHtml = (data.reviewInfo && data.reviewInfo.desc !== 'N/A' && data.reviewInfo.desc !== 'No Reviews') ?
            `<p class="steamRating"><strong>Rating:</strong> ${getRatingStars(data.reviewInfo.percent, data.reviewInfo.desc)}<span class="ratingText">${escapeHtml(data.reviewInfo.desc)}${data.reviewInfo.total ? `  |  ${escapeHtml(data.reviewInfo.total.toLocaleString())} reviews` : ''}</span></p>` :
            '';
        const releaseDateHtml = data.releaseDate ?
            `<p class="steamReleaseDate"><strong>Released:</strong> ${releaseDate}</p>` :
            '';

        tip.innerHTML = `
            ${data.header_image ? `<img src="${headerImage}" alt="${title}" onerror="this.style.display='none'">` : ''}
            <p><strong>${title}</strong></p>
            ${releaseDateHtml}
            <p>${shortDescription}</p>
            ${reviewHtml}
            ${tagsHtml}
            <div class="tipActions">
                <a href="${storeUrl}" target="_blank" rel="noopener noreferrer">🎮 Open on Steam</a>
                <a href="${latestUrl}" target="_blank" rel="noopener noreferrer">↗️ Open Latest Page</a>
            </div>
        `;
    }

    tip.addEventListener('mouseenter', () => {
        cancelHideTip();
        trackingMove = false;
    });

    tip.addEventListener('mouseleave', scheduleHideTip);

    document.addEventListener('mouseover', (e) => {
        const targetLink = e.target.closest(TOPIC_SELECTOR);
        const isOverTip = tip.contains(e.target);

        if (targetLink || isOverTip) cancelHideTip();
        if (!targetLink || (targetLink === currentHoveredLink && !trackingMove)) return;

        const topicInfo = getTopicInfo(targetLink);
        if (!topicInfo) return;

        if (currentHoveredLink && targetLink !== currentHoveredLink && tip.style.display === 'block') {
            tip.style.opacity = '0';
            tip.style.pointerEvents = 'none';
            tip.style.display = 'none';
            hoverId++;
            trackingMove = false;
        }

        currentHoveredLink = targetLink;
        userHovering = true;
        trackingMove = true;
        lastMoveEvent = e;
        const thisId = ++hoverId;

        clearTimeout(showTimeout);
        renderLoading(e, topicInfo.gameName);

        showTimeout = setTimeout(async () => {
            if (hoverId !== thisId || currentHoveredLink !== targetLink) return;

            const data = await fetchSteamWithFallback(topicInfo.gameName);
            if (hoverId !== thisId || currentHoveredLink !== targetLink) return;

            if (data) {
                renderSteamData(data, topicInfo.gameName, topicInfo);
                warmSteamTags(data);
            } else {
                renderNoData(topicInfo.gameName, topicInfo);
            }

            positionTip(lastMoveEvent);
            trackingMove = false;
            tip.style.opacity = '1';
            tip.style.pointerEvents = 'auto';
        }, 0);
    }, true);

    document.addEventListener('mouseout', (e) => {
        const leavingCurrentLink = currentHoveredLink && currentHoveredLink === e.target.closest(TOPIC_SELECTOR);
        const destinationIsTip = tip.contains(e.relatedTarget);
        if (leavingCurrentLink && !destinationIsTip) {
            scheduleHideTip();
            currentHoveredLink = null;
            userHovering = false;
        }
    }, true);

    document.addEventListener('pointermove', (e) => {
        if (trackingMove && tip.style.display === 'block') {
            lastMoveEvent = e;
            positionTip(e);
        }
    }, { capture: true, passive: true });

    async function fetchBatch(names) {
        await Promise.all(names.map(name => fetchSteamWithFallback(name).catch(() => null)));
    }

    async function waitForPreloadTurn() {
        while (userHovering && !isPageHidden) {
            await delay(200);
        }
    }

    function getPreloadNames() {
        const infos = Array.from(document.querySelectorAll(TOPIC_SELECTOR))
            .map(getTopicInfo)
            .filter(Boolean);

        const seen = new Set();
        const ranked = [];
        infos.forEach((info, index) => {
            const name = info.gameName;
            if (!name || seen.has(name) || getFreshCacheEntry(name)) return;

            seen.add(name);
            const rect = info.link.getBoundingClientRect();
            ranked.push({
                name,
                index,
                inViewport: rect.bottom >= 0 && rect.top <= window.innerHeight
            });
        });

        return ranked
            .sort((a, b) => Number(b.inViewport) - Number(a.inViewport) || a.index - b.index)
            .map(item => item.name);
    }

    async function preloadNames(names) {
        let i = 0;
        while (i < names.length) {
            await waitForPreloadTurn();

            const batchSize = isPageHidden ? CONCURRENT_HIDDEN : CONCURRENT_VISIBLE;
            const batch = names.slice(i, i + batchSize);
            await fetchBatch(batch);
            i += batchSize;
            await delay(isPageHidden ? MIN_INTERVAL : MIN_INTERVAL * 2);
        }
    }

    async function preloadTagsForNames(names) {
        let i = 0;
        while (i < names.length) {
            await waitForPreloadTurn();

            const batchSize = isPageHidden ? CONCURRENT_TAG_HIDDEN : CONCURRENT_TAG_VISIBLE;
            const batch = names.slice(i, i + batchSize);
            await Promise.all(batch.map(async (name) => {
                const data = await fetchSteamWithFallback(name).catch(() => null);
                if (data) await warmSteamTags(data);
            }));
            i += batchSize;
            await delay(isPageHidden ? MIN_INTERVAL * 2 : MIN_INTERVAL * 8);
        }
    }

    async function preloadAll() {
        const names = getPreloadNames();
        debugLog(`Preloading ${names.length} topic previews`);

        await preloadNames(names.slice(0, PRIORITY_PRELOAD_COUNT));
        await preloadNames(names.slice(PRIORITY_PRELOAD_COUNT));
        debugLog(`Warming Steam tags for ${names.length} topic previews`);
        await preloadTagsForNames(names);
    }

    window.addEventListener('load', () => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => preloadAll(), { timeout: 3000 });
        } else {
            setTimeout(preloadAll, 2000);
        }
    });

    console.log('CS.RIN.RU Steam Hover Preview script loaded.');
})();
