// ============================================================
// HANDLER: KEUANGAN — menu_keuangan, cek_tagihan, cek_tagihan_pmb, cari_lagi_pmb
// ============================================================
const { userState, clearTimer } = require('../utils/state');

function register(bot) {
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        // --- SUB-MENU KEUANGAN ---
        if (data === 'menu_keuangan') {
            await bot.answerCallbackQuery(query.id);
            clearTimer(chatId);
            userState.set(chatId, { currentMenu: 'menu_keuangan', previousMenu: 'main' });

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🧾 Cek Tagihan Semester', callback_data: 'cek_tagihan' }],
                        [{ text: '🔍 Cek Tagihan PMB', callback_data: 'cek_tagihan_pmb' }],
                        [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                    ]
                }
            };

            bot.editMessageText(
                `💰 *Layanan Keuangan*\n\nSilakan pilih layanan:`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...keyboard }
            );
        }

        // --- CEK TAGIHAN → minta Tahun Akademik dulu ---
        else if (data === 'cek_tagihan') {
            await bot.answerCallbackQuery(query.id);
            const currentState = userState.get(chatId) || {};
            const parentMenu = currentState.currentMenu || 'main';

            clearTimer(chatId);

            const timer = setTimeout(() => {
                userState.delete(chatId);
                bot.sendMessage(chatId, '⏰ *Sesi berakhir.* Silakan mulai kembali dengan /start.', { parse_mode: 'Markdown' });
            }, 120_000);

            userState.set(chatId, { step: 'waiting_tahun_akademik', timer, previousMenu: parentMenu });

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                    ]
                }
            };

            bot.editMessageText(
                `🎓 *Cek Informasi Tagihan*\n\nSilakan masukkan *Tahun Akademik*\n\nContoh: _20231_ atau _20232_`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...keyboard }
            );
        }

        // --- 🔄 CARI LAGI PMB ---
        else if (data === 'cari_lagi_pmb') {
            await bot.answerCallbackQuery(query.id);
            const currentState = userState.get(chatId) || {};
            const parentMenu = currentState.previousMenu || 'menu_keuangan';

            clearTimer(chatId);

            const timer = setTimeout(() => {
                userState.delete(chatId);
                bot.sendMessage(chatId, '⏰ *Sesi berakhir.* Silakan mulai kembali dengan /start.', { parse_mode: 'Markdown' });
            }, 120_000);

            userState.set(chatId, { step: 'waiting_no_pendaftaran', timer, previousMenu: parentMenu });

            bot.editMessageText(
                `🔍 *Cek Tagihan PMB*\n\nSilakan masukkan *Nomor Pendaftaran* Anda:\n\n_Contoh: UMJA202610001_`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]}}
            );
        }

        // --- 🔍 CEK TAGIHAN PMB → minta nomor pendaftaran ---
        else if (data === 'cek_tagihan_pmb') {
            await bot.answerCallbackQuery(query.id);
            const currentState = userState.get(chatId) || {};
            const parentMenu = currentState.currentMenu || 'main';

            clearTimer(chatId);

            const timer = setTimeout(() => {
                userState.delete(chatId);
                bot.sendMessage(chatId, '⏰ *Sesi berakhir.* Silakan mulai kembali dengan /start.', { parse_mode: 'Markdown' });
            }, 120_000);

            userState.set(chatId, { step: 'waiting_no_pendaftaran', timer, previousMenu: parentMenu });

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                    ]
                }
            };

            bot.editMessageText(
                `🔍 *Cek Tagihan PMB*\n\nSilakan masukkan *Nomor Pendaftaran* Anda:\n\n_Contoh: UMJA202610001_`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...keyboard }
            );
        }
    });
}

module.exports = register;
