const cron = require('node-cron');
const animeTrackerHelper = require('../helpers/animeTracker');
const GuildSettings = require('../models/guildSchema');
const AnimeTracker = require('../models/animeTrackerSchema');
const { EmbedBuilder } = require('discord.js');
const logger = require('../helpers/logger');

const lockNotifiedList = new Set();

module.exports = (client) => {
    cron.schedule('* * * * *', async () => {
        try {
            const daftarServer = await GuildSettings.find({ animeChannel: { $ne: null } });
            if (daftarServer.length === 0) return;

            // Dapatkan episode yang sedang atau baru mengudara (toleransi 3 menit terakhir)
            const rilisMenitIni = await animeTrackerHelper.getAiringEpisodesNow(180);
            if (!rilisMenitIni || rilisMenitIni.length === 0) return;

            for (const anime of rilisMenitIni) {
                const uniqueLockKey = `${anime.id}-ep${anime.episode}`;

                // Proteksi memori lokal anti-spam duplikat
                if (lockNotifiedList.has(uniqueLockKey)) continue;
                lockNotifiedList.add(uniqueLockKey);

                let trackRecord = await AnimeTracker.findOne({ animeId: anime.id.toString() });
                if (!trackRecord) {
                    trackRecord = new AnimeTracker({
                        animeId: anime.id.toString(),
                        title: anime.title,
                        lastEpisodeNotified: 0
                    });
                }

                // Jika episode ini sudah pernah dikabarkan, lewati
                if (trackRecord.lastEpisodeNotified >= anime.episode) continue;

                const embedAlert = new EmbedBuilder()
                    .setTitle('🚨 EPISODE TERBARU TELAH RILIS!!!')
                    .setDescription(
                        `### 🛰️ TRANSMISI SIARAN LANGSUNG\n` +
                        `📺 **${anime.title.toUpperCase()}** ${anime.episode ? `(Episode ${anime.episode})` : ''}\n` +
                        `▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n` +
                        `├ 🕒 **Waktu Mengudara:** \`${anime.airingTime} WIB\`\n` +
                        `├ 🎬 **Format & Durasi:** \`${anime.type || 'TV'}\` • \`${anime.duration || 'N/A'}\`\n` +
                        `├ 📊 **Skor:** ⭐ \`${anime.score || 'N/A'}\`\n` +
                        `├ 🏢 **Studio:** \`${anime.studio || 'N/A'}\` • \`${anime.source || 'N/A'}\`\n` +
                        `└ 🎭 **Genre:** _${anime.genres || 'N/A'}_\n` +
                        `▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`
                    )
                    .setColor('#d90429') 
                    .setTimestamp()
                    .setFooter({ 
                        text: 'Lunaria Core • Live Broadcaster Engine', 
                        iconURL: client.user?.displayAvatarURL() || null 
                    });

                if (anime.imageUrl) {
                    embedAlert.setImage(anime.imageUrl);
                }

                for (const server of daftarServer) {
                    const channel = await client.channels.fetch(server.animeChannel).catch(() => null);
                    if (channel && channel.isTextBased()) {
                        await channel.send({ embeds: [embedAlert] }).catch(err => {
                            logger.warn(`[BROADCAST WARN] Gagal mengirim alert live ke guild ${server.guildId}: ${err.message}`);
                        });
                    }
                }

                trackRecord.lastEpisodeNotified = anime.episode;
                await trackRecord.save();
                logger.success(`[ANIME BROADCAST] Alert rilis terkirim: ${anime.title} Episode ${anime.episode}`);
            }

            // Bersihkan antrian cache jika sudah terlalu besar
            if (lockNotifiedList.size > 200) lockNotifiedList.clear();

        } catch (error) {
            logger.error('[CRON JOB] Gagal memproses alert rilis otomatis:', error);
        }
    });
};
