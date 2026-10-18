const logger = require('./logger');

let cachedSchedule = [];
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // Cache selama 15 Menit

/**
 * Universal AniList GraphQL Requester
 */
const fetchAniList = async (query, variables = {}, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'LunariaDiscordBot/1.0'
                },
                body: JSON.stringify({ query, variables })
            });

            if (response.status === 429) {
                // Rate limited, tunggu sebentar lalu coba lagi
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const json = await response.json();
            if (json.errors && json.errors.length > 0) {
                throw new Error(json.errors.map(e => e.message).join('; '));
            }

            return json.data;
        } catch (error) {
            if (i === retries - 1) {
                logger.error('[ANIME TRACKER API ERROR]', error);
                return null;
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    return null;
};

/**
 * Mengambil jadwal tayang anime 24 jam ke depan dari AniList
 */
const fetchScheduleFromAniList = async () => {
    logger.info('[ANIME TRACKER] Memperbarui jadwal penayangan anime dari AniList...');
    
    const nowSec = Math.floor(Date.now() / 1000);
    const greater = nowSec - 3600; // 1 Jam ke belakang
    const lesser = nowSec + (24 * 3600); // 24 Jam ke depan

    const query = `
    query ($greater: Int, $lesser: Int) {
        Page(page: 1, perPage: 50) {
            airingSchedules(airingAt_greater: $greater, airingAt_lesser: $lesser, sort: TIME) {
                id
                airingAt
                episode
                timeUntilAiring
                media {
                    id
                    idMal
                    siteUrl
                    title {
                        romaji
                        english
                        native
                    }
                    format
                    duration
                    averageScore
                    source
                    studios(isMain: true) {
                        nodes {
                            name
                        }
                    }
                    genres
                    isAdult
                    coverImage {
                        extraLarge
                        large
                    }
                    bannerImage
                }
            }
        }
    }`;

    const data = await fetchAniList(query, { greater, lesser });
    if (!data?.Page?.airingSchedules) return [];

    const nowEpoch = Date.now();
    const wibOffset = 7 * 60 * 60 * 1000; // GMT+7 (WIB)

    const rawList = data.Page.airingSchedules;

    // Filter konten eksplisit / dewasa
    const filteredList = rawList.filter(item => {
        if (!item.media) return false;
        if (item.media.isAdult) return false;

        const genres = item.media.genres || [];
        const lowerGenres = genres.map(g => g.toLowerCase());
        const explicitList = ['hentai', 'ecchi', 'erotica', 'boys love', 'girls love'];
        if (lowerGenres.some(g => explicitList.some(ex => g.includes(ex)))) return false;

        return true;
    });

    const hariIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const blnIndo = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const formattedList = filteredList.map(item => {
        const airingUnix = item.airingAt * 1000;
        const selisihMs = airingUnix - nowEpoch;

        // Gunakan Discord dynamic relative timestamp (<t:TIMESTAMP:R>) untuk hitung mundur real-time
        const teksCountdown = `<t:${item.airingAt}:R>`;

        const wibDate = new Date(airingUnix + wibOffset);
        const hari = hariIndo[wibDate.getUTCDay()];
        const bln = blnIndo[wibDate.getUTCMonth()];
        const jam = wibDate.getUTCHours().toString().padStart(2, '0');
        const menit = wibDate.getUTCMinutes().toString().padStart(2, '0');

        const jamWib = `${jam}:${menit}`;
        const tanggalWib = `${hari}, ${wibDate.getUTCDate().toString().padStart(2, '0')} ${bln} ${wibDate.getUTCFullYear()}`;

        const cleanSource = item.media.source ? item.media.source.replace(/_/g, ' ') : 'Original';
        const studioName = item.media.studios?.nodes?.map(n => n.name).join(', ') || 'N/A';
        const genresStr = item.media.genres?.join(', ') || 'N/A';
        const scoreStr = item.media.averageScore ? (item.media.averageScore / 10).toFixed(1) : 'N/A';

        // Prioritaskan Judul Bahasa Jepang (Romaji, lalu Native/Kanji/Kana, baru fallback English)
        const judulJepang = item.media.title.romaji || item.media.title.native || item.media.title.english;

        return {
            id: item.media.id,
            malId: item.media.idMal || item.media.id,
            scheduleId: item.id,
            episode: item.episode,
            title: judulJepang,
            romajiTitle: item.media.title.romaji,
            englishTitle: item.media.title.english,
            nativeTitle: item.media.title.native,
            siteUrl: item.media.siteUrl,
            type: item.media.format || 'TV',
            duration: item.media.duration ? `${item.media.duration} Menit` : 'N/A',
            imageUrl: item.media.coverImage?.extraLarge || item.media.coverImage?.large,
            bannerUrl: item.media.bannerImage,
            airingTime: jamWib,
            airingDate: tanggalWib,
            countdown: teksCountdown,
            score: scoreStr,
            source: cleanSource,
            studio: studioName,
            genres: genresStr,
            timestamp: airingUnix,
            airingAt: item.airingAt
        };
    });

    formattedList.sort((a, b) => a.timestamp - b.timestamp);
    return formattedList;
};

/**
 * Mengambil jadwal tayang anime rolling 24 jam dengan caching otomatis
 */
const getRolling24HourSchedule = async () => {
    try {
        const nowEpoch = Date.now();
        if (cachedSchedule.length === 0 || nowEpoch - lastFetchTime > CACHE_DURATION) {
            const data = await fetchScheduleFromAniList();
            if (data && data.length > 0) {
                cachedSchedule = data;
                lastFetchTime = nowEpoch;
            }
        }
        return cachedSchedule;
    } catch (error) {
        logger.error('[ANIME TRACKER] Gagal mengambil jadwal:', error);
        return cachedSchedule || [];
    }
};

/**
 * Mencari episode anime yang sedang mengudara pada rentang waktu sekarang
 * @param {number} windowSecs - Toleransi rentang waktu dalam detik (default 180s / 3 menit)
 */
const getAiringEpisodesNow = async (windowSecs = 180) => {
    try {
        const schedule = await getRolling24HourSchedule();
        if (!schedule || schedule.length === 0) return [];

        const nowSec = Math.floor(Date.now() / 1000);
        return schedule.filter(item => {
            const diff = nowSec - item.airingAt;
            // Sudah tayang atau sedang tayang dalam rentang 0 s/d windowSecs
            return diff >= 0 && diff <= windowSecs;
        });
    } catch (error) {
        logger.error('[ANIME TRACKER] Error getAiringEpisodesNow:', error);
        return [];
    }
};

/**
 * Kompatibilitas mundur untuk pemanggil getRawAnimeDatabase
 */
const getRawAnimeDatabase = async () => {
    return await getRolling24HourSchedule();
};

/**
 * Mencari detail anime berdasarkan judul
 */
const getAnimeInfo = async (searchQuery) => {
    const query = `
    query ($search: String) {
        Media(search: $search, type: ANIME) {
            id
            idMal
            siteUrl
            title { romaji english native }
            description(asHtml: false)
            format
            episodes
            duration
            averageScore
            status
            genres
            studios(isMain: true) { nodes { name } }
            coverImage { large extraLarge }
        }
    }`;
    const data = await fetchAniList(query, { search: searchQuery });
    return data?.Media || null;
};

/**
 * Mengambil top anime trending musim ini
 */
const getTrendingSeasonal = async (limit = 5) => {
    const query = `
    query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
            media(type: ANIME, sort: TRENDING_DESC, status: RELEASING, isAdult: false) {
                id
                idMal
                siteUrl
                title { romaji english native }
                averageScore
                format
                studios(isMain: true) { nodes { name } }
            }
        }
    }`;
    const data = await fetchAniList(query, { perPage: limit });
    const list = data?.Page?.media || [];
    return list.map(m => ({
        ...m,
        titleDisplay: m.title.romaji || m.title.native || m.title.english
    }));
};

/**
 * Mencari daftar anime berdasarkan kata kunci
 */
const searchAnime = async (searchQuery, limit = 5) => {
    const query = `
    query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
            media(search: $search, type: ANIME, isAdult: false) {
                id
                idMal
                siteUrl
                title { romaji english native }
                format
                averageScore
            }
        }
    }`;
    const data = await fetchAniList(query, { search: searchQuery, perPage: limit });
    const list = data?.Page?.media || [];
    return list.map(m => ({
        ...m,
        titleDisplay: m.title.romaji || m.title.native || m.title.english
    }));
};

/**
 * Mencari data karakter anime
 */
const searchCharacter = async (nameQuery) => {
    const query = `
    query ($search: String) {
        Character(search: $search) {
            id
            name { full native }
            description(asHtml: false)
            siteUrl
            image { large }
        }
    }`;
    const data = await fetchAniList(query, { search: nameQuery });
    return data?.Character || null;
};

/**
 * Mencari manga berdasarkan judul
 */
const searchManga = async (searchQuery) => {
    const query = `
    query ($search: String) {
        Media(search: $search, type: MANGA, isAdult: false) {
            id
            idMal
            siteUrl
            title { romaji english native }
            format
            chapters
            volumes
            averageScore
            description(asHtml: false)
            coverImage { large extraLarge }
        }
    }`;
    const data = await fetchAniList(query, { search: searchQuery });
    return data?.Media || null;
};

/**
 * Mengambil rekomendasi anime acak
 */
const getRandomRecommendation = async () => {
    const randomPage = Math.floor(Math.random() * 50) + 1;
    const query = `
    query ($page: Int) {
        Page(page: $page, perPage: 1) {
            media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
                id
                idMal
                siteUrl
                title { romaji english native }
                format
                averageScore
                description(asHtml: false)
                coverImage { large extraLarge }
            }
        }
    }`;
    const data = await fetchAniList(query, { page: randomPage });
    return data?.Page?.media?.[0] || null;
};

module.exports = {
    getRolling24HourSchedule,
    getAiringEpisodesNow,
    getRawAnimeDatabase,
    getAnimeInfo,
    getTrendingSeasonal,
    searchAnime,
    searchCharacter,
    searchManga,
    getRandomRecommendation
};
