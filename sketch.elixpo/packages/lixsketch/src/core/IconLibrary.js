/* eslint-disable */
// Client-side icon library: the whole search index lives in the browser so
// the icon tool can answer every keystroke without a network round trip.
//
// Sizes (5,149 icons, measured when this was written):
//   index  /icons/info/icons.json  ~1.9 MB raw, ~230 KB gzip  -> loaded client-side
//   all SVG files concatenated     ~13 MB raw,  ~4.3 MB gzip  -> too big to ship
// so the index is downloaded once (idle prefetch when the workspace opens) and
// each SVG stays a static file: grid thumbnails are <img> tags served from the
// HTTP cache, and the markup needed to place an icon is fetched once and
// memoised. ICON_INDEX_BUDGET_BYTES is enforced by a unit test so the index
// cannot silently outgrow the client-side approach.

export const ICON_INDEX_PATH = '/icons/info/icons.json';
export const ICON_INDEX_BUDGET_BYTES = 400 * 1024; // gzip
export const ICON_RESULT_LIMIT = 60;

/** Turn the icons.json metadata map into a flat, pre-lowercased index. */
export function buildIconIndex(metadata) {
    if (!metadata || typeof metadata !== 'object') return [];
    return Object.keys(metadata).map((filename) => {
        const item = metadata[filename] || {};
        const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ') : (item.keywords || '');
        return {
            filename,
            ...item,
            normalizedCategory: String(item.category || '').toLowerCase(),
            searchText: `${filename.replace(/[_-]/g, ' ')} ${keywords} ${item.description || ''} ${item.category || ''}`.toLowerCase(),
        };
    });
}

/**
 * One bounded pass over the index: every term must appear somewhere in the
 * icon's search text. Stops as soon as `limit` results are found.
 */
export function searchIconIndex(index, { q = '', category = '', limit = ICON_RESULT_LIMIT } = {}) {
    const terms = String(q).trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cat = String(category || '').trim().toLowerCase();
    const results = [];
    for (const item of index) {
        if (cat && item.normalizedCategory !== cat) continue;
        if (terms.length && !terms.every((term) => item.searchText.includes(term))) continue;
        const { searchText, normalizedCategory, ...publicItem } = item;
        results.push(publicItem);
        if (results.length === limit) break;
    }
    return results;
}

export function iconUrl(filename, baseUrl = '') {
    return `${baseUrl}/icons/${encodeURIComponent(filename)}`;
}

/** Slow or data-saver connections skip the eager index download. */
export function shouldPrefetchIndex(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
    const connection = nav?.connection;
    if (!connection) return true;
    if (connection.saveData) return false;
    return !/(^|-)2g$/.test(String(connection.effectiveType || ''));
}

/**
 * Memoised loader around the index and SVG files. `fetchImpl` is injectable
 * for tests; `searchFallback` (server search) is used while the index is
 * unavailable, e.g. if its download failed.
 */
export function createIconLibrary({ baseUrl = '', fetchImpl, searchFallback } = {}) {
    const doFetch = fetchImpl || ((...args) => fetch(...args));
    let index = null;
    let indexPromise = null;
    const svgCache = new Map();

    function loadIndex() {
        if (index) return Promise.resolve(index);
        if (!indexPromise) {
            indexPromise = doFetch(`${baseUrl}${ICON_INDEX_PATH}`)
                .then((res) => {
                    if (!res.ok) throw new Error(`icon index HTTP ${res.status}`);
                    return res.json();
                })
                .then((metadata) => {
                    index = buildIconIndex(metadata);
                    return index;
                })
                .catch((err) => {
                    indexPromise = null; // allow a retry on the next request
                    throw err;
                });
        }
        return indexPromise;
    }

    /** Synchronous search once the index is loaded; null before that. */
    function searchSync(params) {
        return index ? searchIconIndex(index, params) : null;
    }

    async function search(params = {}) {
        const ready = searchSync(params);
        if (ready) return ready;
        try {
            return searchIconIndex(await loadIndex(), params);
        } catch (err) {
            if (searchFallback) return searchFallback(params);
            throw err;
        }
    }

    function getSvg(filename) {
        if (!svgCache.has(filename)) {
            const pending = doFetch(iconUrl(filename, baseUrl))
                .then((res) => {
                    if (!res.ok) throw new Error(`icon HTTP ${res.status}`);
                    return res.text();
                })
                .catch((err) => {
                    svgCache.delete(filename);
                    throw err;
                });
            svgCache.set(filename, pending);
        }
        return svgCache.get(filename);
    }

    /** Warm the SVG cache for icons the user is likely to click next. */
    function prefetchSvgs(filenames, max = 24) {
        for (const filename of filenames.slice(0, max)) getSvg(filename).catch(() => {});
    }

    return {
        loadIndex,
        search,
        searchSync,
        getSvg,
        prefetchSvgs,
        isReady: () => index !== null,
        setSearchFallback: (fn) => { searchFallback = fn; },
    };
}

let sharedLibrary = null;

/** One library per page, shared by the icon sidebar and the AI renderer. */
export function getSharedIconLibrary() {
    if (!sharedLibrary) sharedLibrary = createIconLibrary();
    return sharedLibrary;
}
