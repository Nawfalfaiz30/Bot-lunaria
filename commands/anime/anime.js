const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const animeTracker = require('../../helpers/animeTracker');
const logger = require('../../helpers/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'anime',
    aliases: ['animesearch', 'carianime', 'animenews', 'animeupdates', 'infonime', 'listanime', 'nimesearch', 'character', 'char', 'charasearch', 'manga', 'carimanga', 'komik', 'quote', 'animequote', 'katamutiara', 'recommend', 'animerandom', 'rekomendasi'],
    data: new SlashCommandBuilder()
        .setName('anime')
        .setDescription('Sistem pencarian informasi, berita, manga, dan referensi seputar anime.')
        
        // Subcommand: Info (Detail Anime)
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Mencari data detail informasi suatu Anime.')
                .addStringOption(opt => opt.setName('judul').setDescription('Judul anime yang dicari').setRequired(true))
        )
        // Subcommand: News (Trending Musim Ini)
        .addSubcommand(sub => sub.setName('news').setDescription('Melihat daftar anime terpopuler yang sedang tayang musim ini.'))
        
        // Subcommand: Search (Daftar Alternatif)
        .addSubcommand(sub =>
            sub.setName('search')
                .setDescription('Mencari daftar alternatif judul anime berdasarkan kata kunci.')
                .addStringOption(opt => opt.setName('keyword').setDescription('Kata kunci pencarian').setRequired(true))
        )
        // Subcommand: Character (Profil Karakter)
        .addSubcommand(sub =>
            sub.setName('character')
                .setDescription('Mencari data profil karakter anime.')
                .addStringOption(opt => opt.setName('nama').setDescription('Nama karakter').setRequired(true))
        )
        // Subcommand: Manga (Detail Komik)
        .addSubcommand(sub =>
            sub.setName('manga')
                .setDescription('Mencari data detail informasi suatu Manga.')
                .addStringOption(opt => opt.setName('judul').setDescription('Judul manga yang dicari').setRequired(true))
        )
        // Subcommand: Quote (Kata Mutiara)
        .addSubcommand(sub => sub.setName('quote').setDescription('Mendapatkan kutipan kata bijak dari karakter anime.'))
        
        // Subcommand: Recommend (Acak Pilihan DB)
        .addSubcommand(sub => sub.setName('recommend').setDescription('Mendapatkan satu rekomendasi anime acak pilihan database.')),

    async execute(context, args, client) {
        const isInteraction = context.options !== undefined;
        const author = isInteraction ? context.user : context.author;

        // --- PARSING INTEGRASI SUBCOMMAND & TEKS QUERY ---
        let subcommand = '';
        let textQuery = '';

        if (isInteraction) {
            subcommand = context.options.getSubcommand(false);
            if (!subcommand) {
                return context.reply({ 
                    content: '⚠️ Silakan pilih salah satu sub-command yang tersedia!', 
                    flags: [MessageFlags.Ephemeral] 
                });
            }
            if (subcommand === 'info' || subcommand === 'manga') textQuery = context.options.getString('judul');
            else if (subcommand === 'search') textQuery = context.options.getString('keyword');
            else if (subcommand === 'character') textQuery = context.options.getString('nama');
        } else {
            const firstArg = args[0]?.toLowerCase();
            const validSubcommands = ['info', 'news', 'search', 'character', 'manga', 'quote', 'recommend'];

            if (validSubcommands.includes(firstArg)) {
                subcommand = firstArg;
                args.shift();
                textQuery = args.join(' ');
            } else {
                const fullContent = context.content.toLowerCase();
                if (fullContent.includes('animesearch') || fullContent.includes('listanime') || fullContent.includes('nimesearch')) subcommand = 'search';
                else if (fullContent.includes('animenews') || fullContent.includes('animeupdates')) subcommand = 'news';
                else if (fullContent.includes('character') || fullContent.includes('char') || fullContent.includes('charasearch')) subcommand = 'character';
                else if (fullContent.includes('manga') || fullContent.includes('carimanga') || fullContent.includes('komik')) subcommand = 'manga';
                else if (fullContent.includes('quote') || fullContent.includes('animequote') || fullContent.includes('katamutiara')) subcommand = 'quote';
                else if (fullContent.includes('recommend') || fullContent.includes('animerandom') || fullContent.includes('rekomendasi')) subcommand = 'recommend';
                else subcommand = 'info';
                
                textQuery = args.join(' ');
            }
        }

        // --- VALIDASI AKHIR INPUT ---
        if (['info', 'search', 'character', 'manga'].includes(subcommand) && !textQuery) {
            const missingText = {
                info: 'Harap berikan judul anime yang ingin dicari!',
                search: 'Harap tentukan kata kunci pencarian anime!',
                character: 'Masukkan nama karakter yang ingin dicari!',
                manga: 'Masukkan judul manga yang dicari!'
            };
            return context.reply({ content: missingText[subcommand], flags: isInteraction ? [MessageFlags.Ephemeral] : [] });
        }

        if (context.deferReply) await context.deferReply();

        try {
            // --- CASE 1: INFO (ANIME DETAIL VIEW) ---
            if (subcommand === 'info') {
                const anime = await animeTracker.getAnimeInfo(textQuery);

                if (!anime) {
                    const noResult = { content: `Anime dengan judul **${textQuery}** tidak ditemukan.` };
                    return isInteraction ? context.editReply(noResult) : context.reply(noResult);
                }

                const title = anime.title.romaji || anime.title.native || anime.title.english;
                const cleanSynopsis = anime.description ? anime.description.replace(/<[^>]*>/g, '').substring(0, 800) + '...' : 'Tidak ada sinopsis.';
                const scoreText = anime.averageScore ? `${(anime.averageScore / 10).toFixed(1)}/10` : 'N/A';
                const studioText = anime.studios?.nodes?.map(s => s.name).join(', ') || 'N/A';

                const infoEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(anime.siteUrl)
                    .setColor('#2e51a2')
                    .setThumbnail(anime.coverImage?.large || anime.coverImage?.extraLarge)
                    .setDescription(cleanSynopsis)
                    .addFields(
                        { name: '📺 Tipe', value: `${anime.format || 'N/A'} (${anime.episodes || '?'} eps)`, inline: true },
                        { name: '⭐ Skor', value: scoreText, inline: true },
                        { name: '📅 Status', value: `${anime.status || 'N/A'}`, inline: true },
                        { name: '🏢 Studio', value: studioText, inline: true },
                        { name: '🏷️ Genres', value: anime.genres?.join(', ') || 'N/A', inline: false }
                    );

                if (anime.title.native) {
                    infoEmbed.setFooter({ text: `Judul Asli: ${anime.title.native} • Dicari oleh ${author.username}` });
                } else {
                    infoEmbed.setFooter({ text: `Dicari oleh ${author.username}` });
                }

                return isInteraction ? await context.editReply({ embeds: [infoEmbed] }) : await context.reply({ embeds: [infoEmbed] });
            }

            // --- CASE 2: NEWS (SEASONAL CURRENTLY AIRING) ---
            if (subcommand === 'news') {
                const trendingList = await animeTracker.getTrendingSeasonal(5);

                if (!trendingList || trendingList.length === 0) {
                    const noData = { content: 'Gagal memuat jadwal rilis musim ini.' };
                    return isInteraction ? context.editReply(noData) : context.reply(noData);
                }

                const newsEmbed = new EmbedBuilder()
                    .setTitle('📺 Top Trending Anime Tayang Musim Ini')
                    .setColor('#34495e')
                    .setTimestamp();

                trendingList.forEach((anime, index) => {
                    const title = anime.title.romaji || anime.title.native || anime.title.english;
                    const score = anime.averageScore ? `${(anime.averageScore / 10).toFixed(1)}/10` : 'N/A';
                    const studios = anime.studios?.nodes?.map(s => s.name).join(', ') || 'N/A';
                    newsEmbed.addFields({
                        name: `${index + 1}. ${title}`,
                        value: `⭐ Skor: \`${score}\` | Tipe: \`${anime.format || 'N/A'}\`\nStudio: ${studios}`
                    });
                });

                return isInteraction ? await context.editReply({ embeds: [newsEmbed] }) : await context.reply({ embeds: [newsEmbed] });
            }

            // --- CASE 3: SEARCH (LIST MATCHES VIEW) ---
            if (subcommand === 'search') {
                const searchResults = await animeTracker.searchAnime(textQuery, 5);

                if (!searchResults || searchResults.length === 0) {
                    const noRes = { content: 'Hasil pencarian nihil.' };
                    return isInteraction ? context.editReply(noRes) : context.reply(noRes);
                }

                const searchEmbed = new EmbedBuilder()
                    .setTitle(`🔍 Hasil Pencarian untuk: "${textQuery}"`)
                    .setColor('#2980b9')
                    .setDescription('Berikut adalah beberapa judul anime yang cocok dengan pencarianmu:')
                    .setTimestamp();

                searchResults.forEach((anime, idx) => {
                    const title = anime.title.romaji || anime.title.native || anime.title.english;
                    const score = anime.averageScore ? `${(anime.averageScore / 10).toFixed(1)}/10` : 'N/A';
                    searchEmbed.addFields({
                        name: `${idx + 1}. ${title}`,
                        value: `Tipe: \`${anime.format || 'N/A'}\` | Skor: \`${score}\` | [Link AniList](${anime.siteUrl})`
                    });
                });

                return isInteraction ? await context.editReply({ embeds: [searchEmbed] }) : await context.reply({ embeds: [searchEmbed] });
            }

            // --- CASE 4: CHARACTER ---
            if (subcommand === 'character') {
                const char = await animeTracker.searchCharacter(textQuery);

                if (!char) {
                    const noChar = { content: 'Karakter tidak ditemukan.' };
                    return isInteraction ? context.editReply(noChar) : context.reply(noChar);
                }

                const charDesc = char.description ? char.description.replace(/<[^>]*>/g, '').substring(0, 1000) + '...' : 'Tidak ada biografi deskripsi.';

                const charEmbed = new EmbedBuilder()
                    .setTitle(char.name.full)
                    .setURL(char.siteUrl)
                    .setColor('#e74c3c')
                    .setThumbnail(char.image?.large)
                    .setDescription(charDesc)
                    .setFooter({ text: `Nama Jepang: ${char.name.native || 'N/A'}` });

                return isInteraction ? await context.editReply({ embeds: [charEmbed] }) : await context.reply({ embeds: [charEmbed] });
            }

            // --- CASE 5: MANGA ---
            if (subcommand === 'manga') {
                const manga = await animeTracker.searchManga(textQuery);

                if (!manga) {
                    const noManga = { content: 'Manga tidak ditemukan.' };
                    return isInteraction ? context.editReply(noManga) : context.reply(noManga);
                }

                const title = manga.title.english || manga.title.romaji;
                const desc = manga.description ? manga.description.replace(/<[^>]*>/g, '').substring(0, 800) + '...' : 'Tidak ada sinopsis.';
                const score = manga.averageScore ? `${(manga.averageScore / 10).toFixed(1)}/10` : 'N/A';

                const mangaEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(manga.siteUrl)
                    .setColor('#f1c40f')
                    .setThumbnail(manga.coverImage?.large || manga.coverImage?.extraLarge)
                    .setDescription(desc)
                    .addFields(
                        { name: '📖 Tipe', value: `${manga.format || 'N/A'}`, inline: true },
                        { name: '📚 Chapters/Vols', value: `Ch: ${manga.chapters || '?'} / Vol: ${manga.volumes || '?'}`, inline: true },
                        { name: '⭐ Skor', value: score, inline: true }
                    );

                return isInteraction ? await context.editReply({ embeds: [mangaEmbed] }) : await context.reply({ embeds: [mangaEmbed] });
            }

            // --- CASE 6: QUOTE ---
            if (subcommand === 'quote') {
                let quoteText = '';
                let character = '';
                let anime = '';

                try {
                    const quotesFilePath = path.join(__dirname, '../../data/animeQuotes.json');
                    if (fs.existsSync(quotesFilePath)) {
                        const localQuotes = JSON.parse(fs.readFileSync(quotesFilePath, 'utf8'));
                        if (localQuotes.length > 0) {
                            const chosen = localQuotes[Math.floor(Math.random() * localQuotes.length)];
                            quoteText = chosen.quote;
                            character = chosen.character;
                            anime = chosen.anime;
                        }
                    }
                } catch (e) {}

                if (!quoteText) {
                    try {
                        const response = await fetch('https://some-random-api.com/anime/quotes');
                        const data = await response.json();
                        quoteText = data.sentence;
                        character = data.character;
                        anime = data.anime;
                    } catch (e) {
                        quoteText = "Dunia ini kejam, tapi pada saat yang sama juga sangat indah.";
                        character = "Mikasa Ackerman";
                        anime = "Attack on Titan";
                    }
                }

                const quoteEmbed = new EmbedBuilder()
                    .setTitle('📜 Anime Quote')
                    .setColor('#9b59b6')
                    .setDescription(`*"${quoteText}"*`)
                    .addFields(
                        { name: '👤 Karakter', value: character, inline: true },
                        { name: '🎬 Anime', value: anime, inline: true }
                    );

                return isInteraction ? await context.editReply({ embeds: [quoteEmbed] }) : await context.reply({ embeds: [quoteEmbed] });
            }

            // --- CASE 7: RECOMMEND ---
            if (subcommand === 'recommend') {
                const anime = await animeTracker.getRandomRecommendation();

                if (!anime) {
                    const noRec = { content: 'Gagal mengambil rekomendasi anime saat ini.' };
                    return isInteraction ? context.editReply(noRec) : context.reply(noRec);
                }

                const title = anime.title.romaji || anime.title.native || anime.title.english;
                const desc = anime.description ? anime.description.replace(/<[^>]*>/g, '').substring(0, 500) + '...' : 'Tidak ada deskripsi sinopsis.';
                const score = anime.averageScore ? `${(anime.averageScore / 10).toFixed(1)}/10` : 'N/A';

                const recEmbed = new EmbedBuilder()
                    .setTitle(`🎯 Rekomendasi Hari Ini: ${title}`)
                    .setURL(anime.siteUrl)
                    .setColor('#1abc9c')
                    .setThumbnail(anime.coverImage?.large || anime.coverImage?.extraLarge)
                    .setDescription(desc)
                    .addFields(
                        { name: '⭐ Skor', value: score, inline: true },
                        { name: '📺 Tipe', value: `${anime.format || 'N/A'}`, inline: true }
                    );

                return isInteraction ? await context.editReply({ embeds: [recEmbed] }) : await context.reply({ embeds: [recEmbed] });
            }

        } catch (error) {
            logger.error(`[ANIME ERROR] Subcommand: ${subcommand}`, error);
            const errReply = { content: '❌ Terjadi kendala saat menghubungkan ke sistem database Anime.' };
            return isInteraction ? context.editReply(errReply) : context.reply(errReply);
        }
    }
};