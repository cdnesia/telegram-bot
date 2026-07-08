// ============================================================
// HANDLER: NAVIGASI — back, menu_utama
// ============================================================
const { userState, resetUserState, buildMainMenu } = require('../utils/state');

function register(bot) {
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        // --- ⬅ KEMBALI (back 1 level) ---
        if (data === 'back') {
            await bot.answerCallbackQuery(query.id);

            const currentState = userState.get(chatId) || {};
            const previousMenu = currentState.previousMenu || 'main';
            const target = previousMenu === 'main' ? 'menu_utama' : previousMenu;

            // Pantulkan ke handler menu target
            bot.emit('callback_query', { ...query, data: target });
        }

        // --- 🏠 MENU UTAMA (langsung ke root) ---
        else if (data === 'menu_utama') {
            await bot.answerCallbackQuery(query.id);
            resetUserState(chatId);

            bot.editMessageText(
                `� *Selamat datang di UM Jambi Assist!*\n\n` +
                `Halo! Saya asisten digital *Universitas Muhammadiyah Jambi* yang siap membantu Anda. 😊\n\n` +
                `*Layanan yang tersedia:*\n` +
                `• 📝 Informasi PMB\n` +
                `• 💳 Layanan Keuangan\n` +
                `• 📚 Layanan Akademik\n` +
                `• 🎓 Layanan Wisuda\n` +
                `• 📄 Layanan Surat & Administrasi\n` +
                `• 📢 Informasi Kampus\n\n` +
                `Silakan pilih layanan yang Anda butuhkan di bawah ini ya 👇`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...buildMainMenu(chatId) }
            );
        }
    });
}

module.exports = register;
