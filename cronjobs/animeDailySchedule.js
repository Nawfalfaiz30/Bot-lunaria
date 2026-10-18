const cron = require('node-cron');
const animeTrackerHelper = require('../helpers/animeTracker');
const GuildSettings = require('../models/guildSchema');
const { EmbedBuilder } = require('discord.js');
const logger = require('../helpers/logger');

const broadcastDailySchedule = async (client) => {
    logger.info('[CRON JOB] Memancarkan pembaruan visual koran anime...');
    try {
        const guilds = await GuildSettings.find({ animeChannel: { $ne: null } });
        if (guilds.length === 0) {
            logger.info('[CRON JOB] Tidak ada server yang mengatur animeChannel.');
            return;
        }

        const scheduleList = await animeTrackerHelper.getRolling24HourSchedule();
        if (!scheduleList || scheduleList.length === 0) {
            logger.info('[CRON JOB] Tidak ada jadwal penayangan anime aktif dalam 24 jam ke depan.');
            return;
        }

        const sekarang = new Date();

        const embedDashboard = new EmbedBuilder()
            .setTitle('⚡ LUNARIA ANIME DAILY')
            .setDescription(
                `### 🛰️ TRANSMISI PENAYANGAN AKTIF\n` +
                `> *Jadwal penayangan anime untuk 24 jam ke depan (Total: ${scheduleList.length} Judul).*\n` +
                `*Waktu Broadcast: <t:${Math.floor(sekarang.getTime() / 1000)}:F>*\n`
            )
            .setThumbnail(client.user?.displayAvatarURL({ dynamic: true, size: 256 }) || null)
            .setColor('#00ffcc') 
            .setTimestamp()
            .setFooter({ text: 'Lunaria Core • Automated Tracking System', iconURL: client.user?.displayAvatarURL() || null });

        // Batasi tampilan maksimal 20 anime agar tidak melebihi batasan 6000 karakter Discord API
        const displayList = scheduleList.slice(0, 20);

        let fieldTeks = "";
        let chunkId = 1;

        displayList.forEach((anime) => {
            const cleanGenres = anime.genres.length > 40 ? anime.genres.substring(0, 37) + '...' : anime.genres;

            const itemBlock = 
                `▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n` +
                `📺 **${anime.title.toUpperCase()}** ${anime.episode ? `(Ep ${anime.episode})` : ''}\n` +
                `├ 🕒 **Waktu:** \`${anime.airingTime} WIB\` (${anime.airingDate.split(',')[0]})\n` +
                `├ 📣 **Status:** ${anime.countdown}\n` +
                `├ 📊 **Info:** ⭐ \`${anime.score}\` • 🏢 \`${anime.studio}\`\n` +
                `└ 🎭 **Genre:** _${cleanGenres}_\n\n`;

            // Batas aman 850 karakter per field agar rapi di mobile & desktop
            if ((fieldTeks + itemBlock).length > 850) {
                embedDashboard.addFields({ 
                    name: chunkId === 1 ? '\n📅 LIST ANIME YANG TAYANG' : '\u200B', 
                    value: fieldTeks 
                });
                fieldTeks = itemBlock;
                chunkId++;
            } else {
                fieldTeks += itemBlock;
            }
        });

        if (fieldTeks) {
            embedDashboard.addFields({ 
                name: chunkId === 1 ? '\n📅 LIST ANIME YANG TAYANG' : '\u200B', 
                value: fieldTeks 
            });
        }

        let sentCount = 0;
        for (const server of guilds) {
            try {
                const channel = await client.channels.fetch(server.animeChannel).catch(() => null);
                if (channel && channel.isTextBased()) {
                    await channel.send({ embeds: [embedDashboard] }).catch(err => {
                        logger.warn(`[BROADCAST WARN] Gagal kirim Daily Koran ke guild ${server.guildId}: ${err.message}`);
                    });
                    sentCount++;
                }
            } catch (chanErr) {
                logger.warn(`[BROADCAST WARN] Gagal mengakses channel untuk guild ${server.guildId}: ${chanErr.message}`);
            }
        }
        logger.success(`[CRON JOB] Sukses mendistribusikan visual koran anime ke ${sentCount} server.`);
    } catch (error) {
        logger.error('[CRON JOB] Terjadi error pada eksekusi animeDailySchedule:', error);
    }
};

module.exports = (client) => {
    // Eksekusi setiap hari pukul 06:00 WIB (Waktu pagi sebelum mulai hari)
    cron.schedule('0 6 * * *', async () => {
        await broadcastDailySchedule(client);
    }, { scheduled: true, timezone: "Asia/Jakarta" });
};

module.exports.broadcastDailySchedule = broadcastDailySchedule;
