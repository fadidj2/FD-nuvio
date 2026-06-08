// AnimePahe for Nuvio - Ported from CloudStream (Basic Version)
// Note: AnimePahe is complex. This is a functional starting point.

const cheerio = require('cheerio-without-node-native');

const BASE_URL = "https://animepahe.ru";

function getStreams(tmdbId, mediaType = "anime", seasonNum = null, episodeNum = null) {
    return new Promise((resolve) => {
        if (mediaType !== "anime") {
            resolve([]);
            return;
        }

        // For Nuvio, tmdbId is often the title or we need to search
        // This version assumes we search by title - improve later
        const searchQuery = "One Piece"; // Placeholder - replace with actual title from context if possible

        fetch(`${BASE_URL}/api?m=search&l=8&q=${encodeURIComponent(searchQuery)}`, {
            headers: {
                "Referer": BASE_URL + "/",
                "Cookie": "__ddg2_=1234567890"
            }
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                if (!data.data || data.data.length === 0) {
                    resolve([]);
                    return;
                }

                // Take first result
                const anime = data.data[0];
                const session = anime.session;

                // Get episodes (first page)
                return fetch(`${BASE_URL}/api?m=release&id=${session}&sort=episode_asc&page=1`, {
                    headers: { "Cookie": "__ddg2_=1234567890" }
                });
            } catch (e) {
                resolve([]);
            }
        })
        .then(res => res ? res.text() : null)
        .then(text => {
            if (!text) {
                resolve([]);
                return;
            }

            try {
                const episodeData = JSON.parse(text);
                const streams = [];

                if (episodeData.data && episodeData.data.length > 0) {
                    episodeData.data.forEach(ep => {
                        if (episodeNum && ep.episode != episodeNum) return;

                        const playUrl = `${BASE_URL}/play/${session}/${ep.session}`;

                        streams.push({
                            name: `AnimePahe - Episode ${ep.episode}`,
                            title: `AnimePahe - EP ${ep.episode}`,
                            url: playUrl,
                            quality: "720p", // Kwik usually has multiple - extractor needed
                            size: "Unknown",
                            headers: { "Referer": BASE_URL + "/" },
                            provider: "AnimePahe"
                        });
                    });
                }

                resolve(streams);
            } catch (e) {
                resolve([]);
            }
        })
        .catch(() => resolve([]));
    });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
