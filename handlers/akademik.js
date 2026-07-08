// ============================================================
// HANDLER: AKADEMIK — menu_akademik
// ============================================================
const { userState, clearTimer } = require('../utils/state');

function register(bot) {
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        // --- MENU AKADEMIK ---
        if (data === 'menu_akademik') {
            await bot.answerCallbackQuery(query.id);
            clearTimer(chatId);
            userState.set(chatId, { currentMenu: 'menu_akademik', previousMenu: 'main' });

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                    ]
                }
            };

            bot.editMessageText(
                `📚 *Layanan Akademik*\n\n🚧 *Dalam pengembangan.*\n\nFitur-fitur layanan akademik akan segera tersedia.`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...keyboard }
            );
        }
    });
}

module.exports = register;
