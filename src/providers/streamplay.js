/**
 * StreamPlay Enhanced Scraper for Nuvio
 * Ported from: phisher98/cloudstream-extensions-phisher
 * 
 * Features:
 * - TMDB API search by title
 * - Cloudstream-like metadata fetching
 * - Smart caching for performance
 * - Multiple extraction endpoints
 * - Stremio Cinemeta integration
 * 
 * Author: Phisher98 (Original), Enhanced for Nuvio
 * License: GNU GPLv3
 */

"use strict";

const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const OFFICIAL_TMDB_URL = "https://api.themoviedb.org/3";
const CINEMETA_API = "https://aiometadata.elfhosted.com/stremio/b7cb164b-074b-41d5-b458-b3a834e197bb";

// Enhanced cache with metadata
let metadataCache = {};
let searchCache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Search TMDB by title (Cloudstream-like behavior)
 */
function searchTmdbByTitle(query, mediaType = "multi") {
  return new Promise((resolve) => {
    const cacheKey = `search_${query}_${mediaType}`;
    
    // Check cache first
    if (searchCache[cacheKey] && (Date.now() - searchCache[cacheKey].timestamp) < CACHE_TTL) {
      console.log(`[StreamPlay] Using cached search results for: ${query}`);
      return resolve(searchCache[cacheKey].data);
    }

    const searchUrl = `${OFFICIAL_TMDB_URL}/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=1`;
    
    fetch(searchUrl, { timeout: 8000 })
      .then((response) => response.json())
      .then((data) => {
        const results = (data.results || [])
          .filter((item) => item.poster_path || item.backdrop_path)
          .slice(0, 20)
          .map((item) => ({
            id: item.id,
            type: item.media_type || mediaType,
            title: item.title || item.name,
            originalTitle: item.original_title || item.original_name,
            year: (item.release_date || item.first_air_date || "").split("-")[0],
            poster: item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : null,
            backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
            rating: item.vote_average,
            description: item.overview,
            isMovie: item.media_type === "movie",
            isTv: item.media_type === "tv",
            isAnime: false // Will be detected from genres later
          }));

        // Cache results
        searchCache[cacheKey] = { data: results, timestamp: Date.now() };
        console.log(`[StreamPlay] Found ${results.length} search results for: ${query}`);
        resolve(results);
      })
      .catch((error) => {
        console.error(`[StreamPlay] Search error: ${error.message}`);
        resolve([]);
      });
  });
}

/**
 * Fetch full media details with metadata (Cloudstream-like)
 */
function fetchMediaDetails(tmdbId, mediaType) {
  return new Promise((resolve) => {
    const cacheKey = `metadata_${tmdbId}_${mediaType}`;
    
    // Check cache first
    if (metadataCache[cacheKey] && (Date.now() - metadataCache[cacheKey].timestamp) < CACHE_TTL) {
      console.log(`[StreamPlay] Using cached metadata for: ${tmdbId}`);
      return resolve(metadataCache[cacheKey].data);
    }

    const type = mediaType === "movie" ? "movie" : "tv";
    const detailUrl = `${OFFICIAL_TMDB_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,videos,credits,recommendations,images`;
    
    fetch(detailUrl, { timeout: 10000 })
      .then((response) => response.json())
      .then((data) => {
        const isAnime = (data.genres || []).some((g) => g.name === "Animation") && 
                       (data.original_language === "ja" || data.original_language === "zh");
        
        const metadata = {
          id: data.id,
          type: type,
          title: data.title || data.name,
          originalTitle: data.original_title || data.original_name,
          year: (data.release_date || data.first_air_date || "").split("-")[0],
          poster: data.poster_path ? `https://image.tmdb.org/t/p/original${data.poster_path}` : null,
          backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
          rating: data.vote_average,
          description: data.overview,
          genres: (data.genres || []).map((g) => g.name),
          imdbId: data.external_ids?.imdb_id,
          tvdbId: data.external_ids?.tvdb_id,
          isAnime: isAnime,
          isMovie: type === "movie",
          isTv: type === "tv",
          runtime: data.runtime,
          status: data.status,
          seasons: data.seasons ? data.seasons.length : 0,
          actors: (data.credits?.cast || []).slice(0, 5).map((a) => ({
            name: a.name,
            character: a.character
          })),
          recommendations: (data.recommendations?.results || [])
            .slice(0, 5)
            .map((r) => ({
              id: r.id,
              title: r.title || r.name,
              type: r.media_type
            }))
        };

        // Cache metadata
        metadataCache[cacheKey] = { data: metadata, timestamp: Date.now() };
        resolve(metadata);
      })
      .catch((error) => {
        console.error(`[StreamPlay] Metadata fetch error: ${error.message}`);
        resolve(null);
      });
  });
}

/**
 * Extract streams from Stremio Cinemeta API
 */
function fetchCinemetaStreams(imdbId, type = "movie", season, episode) {
  return new Promise((resolve) => {
    if (!imdbId) {
      return resolve([]);
    }

    const cinetype = type === "tv" ? "series" : "movie";
    const streamUrl = type === "tv" 
      ? `${CINEMETA_API}/stream/${cinetype}/${imdbId}:${season}:${episode}.json`
      : `${CINEMETA_API}/stream/${cinetype}/${imdbId}.json`;

    fetch(streamUrl, { timeout: 10000 })
      .then((response) => response.json())
      .then((data) => {
        const streams = [];

        if (data.streams) {
          data.streams.forEach((stream, index) => {
            const isHls = stream.url?.includes(".m3u8");
            
            streams.push({
              name: `StreamPlay - ${stream.title || `Source ${index + 1}`}`,
              title: stream.title || `Stream ${index + 1}`,
              url: stream.url || stream.externalUrl || "#",
              quality: stream.quality || (isHls ? "Variable" : "720p"),
              size: "Unknown",
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.google.com/'
              },
              provider: "streamplay",
              isHls: isHls,
              type: stream.type || "http"
            });
          });
        }

        if (data.meta?.videos) {
          data.meta.videos.forEach((video) => {
            streams.push({
              name: `StreamPlay - Torrent: ${video.title}`,
              title: video.title,
              url: video.url || "#",
              quality: video.quality || "1080p",
              size: video.size || "Unknown",
              headers: {},
              provider: "streamplay",
              type: "torrent"
            });
          });
        }

        console.log(`[StreamPlay] Found ${streams.length} Cinemeta streams for ${imdbId}`);
        resolve(streams);
      })
      .catch((error) => {
        console.error(`[StreamPlay] Cinemeta fetch error: ${error.message}`);
        resolve([]);
      });
  });
}

/**
 * Main scraper function for direct TMDB ID input
 * Maintains backward compatibility
 */
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve) => {
    if (!tmdbId) {
      return resolve([]);
    }

    console.log(`[StreamPlay] Fetching ${mediaType} ${tmdbId}`);

    // Fetch full metadata first
    fetchMediaDetails(tmdbId, mediaType)
      .then((media) => {
        if (!media) {
          return resolve([]);
        }

        console.log(`[StreamPlay] Title: ${media.title}`);

        // Get streams from Cinemeta
        return fetchCinemetaStreams(
          media.imdbId,
          media.type,
          seasonNum,
          episodeNum
        ).then((streams) => {
          console.log(`[StreamPlay] Total streams found: ${streams.length}`);
          resolve(streams.length > 0 ? streams : []);
        });
      })
      .catch((error) => {
        console.error(`[StreamPlay] Error: ${error.message}`);
        resolve([]);
      });
  });
}

/**
 * Enhanced search function - search by title and return Cloudstream-like results
 * Returns array of {metadata + quick preview of streams}
 */
function searchStreams(query) {
  return new Promise((resolve) => {
    console.log(`[StreamPlay] Searching for: ${query}`);

    searchTmdbByTitle(query, "multi")
      .then((searchResults) => {
        // Fetch full metadata for top 5 results
        const promises = searchResults.slice(0, 5).map((result) => {
          return fetchMediaDetails(result.id, result.type)
            .then((metadata) => ({
              ...result,
              ...metadata,
              // Indicate we have metadata loaded
              metadataLoaded: true
            }));
        });

        return Promise.all(promises);
      })
      .then((results) => {
        console.log(`[StreamPlay] Returning ${results.length} detailed search results`);
        resolve(results);
      })
      .catch((error) => {
        console.error(`[StreamPlay] Search error: ${error.message}`);
        resolve([]);
      });
  });
}

/**
 * Get streams for a specific search result
 * Use after user selects from searchStreams()
 */
function getStreamsForResult(result, seasonNum, episodeNum) {
  return new Promise((resolve) => {
    console.log(`[StreamPlay] Getting streams for: ${result.title}`);

    fetchCinemetaStreams(result.imdbId, result.type, seasonNum, episodeNum)
      .then((streams) => {
        console.log(`[StreamPlay] Found ${streams.length} streams`);
        resolve(streams);
      })
      .catch((error) => {
        console.error(`[StreamPlay] Stream fetch error: ${error.message}`);
        resolve([]);
      });
  });
}

/**
 * Clear caches if needed
 */
function clearCaches() {
  metadataCache = {};
  searchCache = {};
  console.log("[StreamPlay] Caches cleared");
}

// Export for React Native/Nuvio compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getStreams,
    searchStreams,
    getStreamsForResult,
    fetchMediaDetails,
    searchTmdbByTitle,
    clearCaches
  };
} else {
  global.getStreams = getStreams;
  global.searchStreams = searchStreams;
  global.getStreamsForResult = getStreamsForResult;
  global.fetchMediaDetails = fetchMediaDetails;
  global.searchTmdbByTitle = searchTmdbByTitle;
  global.clearCaches = clearCaches;
}
