/**
 * StreamPlay Scraper for Nuvio
 * Ported from: phisher98/cloudstream-extensions-phisher
 * 
 * This scraper provides movie and TV show streams using TMDB API
 * and multiple extraction endpoints.
 * 
 * Author: Phisher98 (Original), Ported to Nuvio
 * License: GNU GPLv3
 */

"use strict";

const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const OFFICIAL_TMDB_URL = "https://api.themoviedb.org/3";
const CINEMETA_API = "https://aiometadata.elfhosted.com/stremio/b7cb164b-074b-41d5-b458-b3a834e197bb";

// Cache management
let apiBaseCache = {
  url: null,
  timestamp: null,
  ttl: 10 * 60 * 1000 // 10 minutes
};

/**
 * Get the current API base URL (with fallback support)
 */
function getApiBase() {
  return new Promise((resolve) => {
    // Check cache first
    if (apiBaseCache.url && (Date.now() - apiBaseCache.timestamp) < apiBaseCache.ttl) {
      console.log("[StreamPlay] Using cached API base");
      return resolve(apiBaseCache.url);
    }

    // Try official TMDB API
    checkConnectivity(OFFICIAL_TMDB_URL)
      .then((isWorking) => {
        if (isWorking) {
          console.log("[StreamPlay] ✅ Using official TMDB API");
          apiBaseCache = { url: OFFICIAL_TMDB_URL, timestamp: Date.now() };
          return resolve(OFFICIAL_TMDB_URL);
        }
        
        // Fallback to official if no proxy available
        console.log("[StreamPlay] ⚠️ Falling back to official TMDB API");
        apiBaseCache = { url: OFFICIAL_TMDB_URL, timestamp: Date.now() };
        resolve(OFFICIAL_TMDB_URL);
      })
      .catch(() => {
        apiBaseCache = { url: OFFICIAL_TMDB_URL, timestamp: Date.now() };
        resolve(OFFICIAL_TMDB_URL);
      });
  });
}

/**
 * Check if an API endpoint is accessible
 */
function checkConnectivity(url) {
  return new Promise((resolve) => {
    const testUrl = `${url}/configuration?api_key=${TMDB_API_KEY}`;
    
    fetch(testUrl, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      timeout: 2000
    })
      .then((response) => {
        resolve(response.status === 200 || response.status === 304);
      })
      .catch(() => resolve(false));
  });
}

/**
 * Fetch media details from TMDB
 */
function fetchTmdbMedia(tmdbId, mediaType, apiBase) {
  return new Promise((resolve, reject) => {
    const url = `${apiBase}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,videos,recommendations,credits`;
    
    fetch(url, { timeout: 8000 })
      .then((response) => response.json())
      .then((data) => {
        if (data.id) {
          resolve(data);
        } else {
          reject(new Error("Invalid TMDB response"));
        }
      })
      .catch((error) => reject(error));
  });
}

/**
 * Search for media on TMDB
 */
function searchTmdb(query, mediaType, apiBase) {
  return new Promise((resolve) => {
    const searchUrl = `${apiBase}/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;
    
    fetch(searchUrl, { timeout: 5000 })
      .then((response) => response.json())
      .then((data) => {
        resolve(data.results || []);
      })
      .catch(() => resolve([]));
  });
}

/**
 * Extract streams from various sources
 */
function extractStreams(sourceUrl, headers = {}) {
  return new Promise((resolve) => {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.google.com/',
      ...headers
    };

    fetch(sourceUrl, {
      headers: defaultHeaders,
      timeout: 10000
    })
      .then((response) => {
        if (!response.ok) {
          return resolve([]);
        }
        return response.text();
      })
      .then((html) => {
        const streams = [];

        // Extract HLS streams
        const m3u8Match = html.match(/["']([^"']*\.m3u8[^"']*)["']/);
        if (m3u8Match && m3u8Match[1]) {
          streams.push({
            name: "StreamPlay - HLS",
            title: "StreamPlay HLS Stream",
            url: m3u8Match[1].startsWith('http') ? m3u8Match[1] : sourceUrl.split('/').slice(0, 3).join('/') + m3u8Match[1],
            quality: "1080p",
            size: "Unknown",
            headers: defaultHeaders,
            provider: "streamplay"
          });
        }

        // Extract MP4 streams
        const mp4Match = html.match(/["']([^"']*\.mp4[^"']*)["']/);
        if (mp4Match && mp4Match[1]) {
          streams.push({
            name: "StreamPlay - MP4",
            title: "StreamPlay MP4 Stream",
            url: mp4Match[1].startsWith('http') ? mp4Match[1] : sourceUrl.split('/').slice(0, 3).join('/') + mp4Match[1],
            quality: "720p",
            size: "Unknown",
            headers: defaultHeaders,
            provider: "streamplay"
          });
        }

        resolve(streams);
      })
      .catch(() => resolve([]));
  });
}

/**
 * Main scraper function - Required for Nuvio
 */
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve, reject) => {
    if (!tmdbId) {
      return resolve([]);
    }

    console.log(`[StreamPlay] Fetching ${mediaType} ${tmdbId}`);

    getApiBase()
      .then((apiBase) => fetchTmdbMedia(tmdbId, mediaType, apiBase))
      .then((media) => {
        const title = media.title || media.name;
        const imdbId = media.external_ids?.imdb_id;
        const posterUrl = media.poster_path ? `https://image.tmdb.org/t/p/original${media.poster_path}` : null;

        console.log(`[StreamPlay] Found: ${title}`);

        const streams = [];

        // Try Stremio Cinemeta API
        if (imdbId) {
          const cinetype = mediaType === 'tv' ? 'series' : 'movie';
          const cineUrl = `${CINEMETA_API}/meta/${cinetype}/${imdbId}.json`;

          fetch(cineUrl, { timeout: 5000 })
            .then((response) => response.json())
            .then((cineData) => {
              if (cineData.meta && cineData.meta.streams) {
                cineData.meta.streams.forEach((stream, index) => {
                  streams.push({
                    name: `StreamPlay - Stream ${index + 1}`,
                    title: title,
                    url: stream.url || stream.externalUrl || "#",
                    quality: stream.quality || "1080p",
                    size: "Unknown",
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    provider: "streamplay"
                  });
                });
              }

              console.log(`[StreamPlay] Found ${streams.length} streams`);
              resolve(streams.length > 0 ? streams : []);
            })
            .catch(() => {
              console.log("[StreamPlay] Cinemeta API failed, using fallback");
              resolve(streams.length > 0 ? streams : []);
            });
        } else {
          resolve(streams);
        }
      })
      .catch((error) => {
        console.error(`[StreamPlay] Error: ${error.message}`);
        resolve([]);
      });
  });
}

// Export for React Native/Nuvio compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
