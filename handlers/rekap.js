// ============================================================
// HANDLER: REKAP PMB (admin only) — rekap_pmb
// ============================================================
const { pool } = require('../config/database');
const { userState, clearTimer, isAdmin } = require('../utils/state');

function register(bot) {
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        // --- 🔒 REKAP PMB (admin only) ---
        if (data === 'rekap_pmb') {
            await bot.answerCallbackQuery(query.id);
            if (!isAdmin(chatId)) {
                return bot.editMessageText(`🚫 Anda tidak memiliki akses ke fitur ini.`, { chat_id: chatId, message_id: messageId });
            }

            clearTimer(chatId);
            userState.set(chatId, { currentMenu: 'rekap_pmb', previousMenu: 'main' });

            const rp = (n) => 'Rp ' + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

            const [rekap] = await pool.execute(`
                SELECT nama_program_studi AS prodi,
                       COUNT(*) AS total,
                       SUM(nominal_ditagih - nominal_terbayar) AS tunggakan
                FROM tagihan
                WHERE npm LIKE 'UMJA%'
                  AND status_aktif = 'Y'
                  AND nominal_terbayar < nominal_ditagih
                GROUP BY nama_program_studi
                ORDER BY nama_program_studi
            `);

            const [mhsPerProdi] = await pool.execute(`
                SELECT nama_program_studi AS prodi,
                       COUNT(DISTINCT npm) AS total_mhs
                FROM tagihan
                WHERE npm LIKE 'UMJA%'
                  AND status_aktif = 'Y'
                  AND nominal_terbayar < nominal_ditagih
                GROUP BY nama_program_studi
                ORDER BY nama_program_studi
            `);

            const [tRows] = await pool.execute(`
                SELECT COUNT(*) AS tagihan,
                       SUM(nominal_ditagih - nominal_terbayar) AS tunggakan,
                       COUNT(DISTINCT npm) AS mhs
                FROM tagihan
                WHERE npm LIKE 'UMJA%'
                  AND status_aktif = 'Y'
                  AND nominal_terbayar < nominal_ditagih
            `);
            const t = tRows[0];

            const lines = ['📊 *Laporan Penerimaan Mahasiswa Baru*\n'];
            if (rekap.length === 0) {
                lines.push('✅ Seluruh tagihan PMB telah dilunasi.');
            } else {
                rekap.forEach((r, i) => {
                    const m = mhsPerProdi.find(x => x.prodi === r.prodi);
                    lines.push(`*${i + 1}. ${r.prodi}*`);
                    lines.push(`   👥 ${m ? m.total_mhs : 0} pendaftar  │  📄 ${r.total} tagihan  │  💰 ${rp(r.tunggakan)}`);
                });
                lines.push('');
                lines.push('─────────────────────────');
                lines.push(`📊 *Total*  :  👥 ${t.mhs} pendaftar  │  📄 ${t.tagihan} tagihan  │  💰 ${rp(t.tunggakan)}`);
            }

            bot.editMessageText(lines.join('\n'), {
                chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]}
            });
        }
    });
}

module.exports = register;
