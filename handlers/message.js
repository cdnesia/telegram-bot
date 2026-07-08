// ============================================================
// HANDLER: MESSAGE — /start, /batal, input flow
// ============================================================
const tagihanController = require('../controllers/tagihan');
const { userState, clearTimer, resetUserState, buildMainMenu } = require('../utils/state');

function register(bot) {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        // Abaikan non-teks
        if (!text) return;

        // --- /start ---
        if (text.trim() === '/start') {
            resetUserState(chatId);
            bot.sendMessage(chatId,
                `👋 *Selamat datang di UM Jambi Assist!*\n\n` +
                `Asisten digital *Universitas Muhammadiyah Jambi* yang membantu layanan akademik, keuangan, dan informasi kampus.\n\n` +
                `*Layanan yang tersedia:*\n` +
                `• 📝 Layanan PMB\n` +
                `• 💳 Layanan Keuangan\n` +
                `• 📚 Layanan Akademik\n` +
                `• 🎓 Layanan Wisuda\n` +
                `• 📄 Layanan Surat & Administrasi\n` +
                `• 📢 Informasi Kampus\n\n` +
                `_UM Jambi Assist siap membantu Anda kapan saja dengan layanan yang cepat, mudah, dan aman._\n\n` +
                `Silakan pilih layanan di bawah ini:`,
                { parse_mode: 'Markdown', ...buildMainMenu(chatId) }
            );
            return;
        }

        // --- /batal ---
        if (text.trim() === '/batal') {
            const state = userState.get(chatId);
            if (state && (state.step === 'waiting_npm' || state.step === 'waiting_no_pendaftaran' || state.step === 'waiting_tahun_akademik')) {
                resetUserState(chatId);
                bot.sendMessage(chatId,
                    `❌ *Proses dibatalkan.*\n\nAnda dapat memilih menu kembali:`,
                    { parse_mode: 'Markdown', ...buildMainMenu(chatId) }
                );
            } else {
                bot.sendMessage(chatId, 'ℹ️ Tidak ada proses yang sedang berjalan.');
            }
            return;
        }

        // Setelah /start dan /batal, abaikan semua command lain
        if (text.startsWith('/')) return;

        const state = userState.get(chatId);
        if (!state) return;

        const step = state.step;

        // --- FLOW: Input Tahun Akademik (step 1 Cek Tagihan) ---
        if (step === 'waiting_tahun_akademik') {
            const tahunAkademik = text.trim();
            // Validasi format: 5 digit, diawali 20, diakhiri 1 (ganjil) atau 2 (genap)
            if (!/^20\d{2}[12]$/.test(tahunAkademik)) {
                bot.sendMessage(chatId,
                    '⚠️ *Format Tahun Akademik tidak valid.*\n\nGunakan format: *Tahun + Semester*\n✅ 20231\n✅ 20232\n\nSilakan masukkan kembali:',
                    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
                        [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                    ]}}
                );
                return;
            }

            const previousMenu = state.previousMenu || 'main';
            clearTimer(chatId);

            // Lanjut ke step 2: minta NPM
            const timer = setTimeout(() => {
                userState.delete(chatId);
                bot.sendMessage(chatId, '⏰ *Sesi berakhir.* Silakan mulai kembali dengan /start.', { parse_mode: 'Markdown' });
            }, 120_000);

            userState.set(chatId, { step: 'waiting_npm', timer, previousMenu, tahunAkademik });

            bot.sendMessage(chatId,
                `📅 Tahun Akademik: *${tahunAkademik}*\n\nSilakan masukkan *Nomor Pokok Mahasiswa (NPM)* Anda:\n\n_Contoh: S12560001_`,
                { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]}}
            );
        }

        // --- FLOW: Input NPM (Cek Tagihan Mahasiswa) ---
        else if (step === 'waiting_npm') {
            const nim = text.trim();
            if (!/^[\dA-Za-z]+$/.test(nim)) {
                bot.sendMessage(chatId, '⚠️ Format NPM tidak dikenali. Mohon periksa kembali:', { parse_mode: 'Markdown' });
                return;
            }

            const previousMenu = state.previousMenu || 'main';
            const tahunAkademik = state.tahunAkademik || null;
            clearTimer(chatId);
            userState.set(chatId, { previousMenu });

            await bot.sendMessage(chatId, '🔍 *Sedang mengambil data tagihan...*', { parse_mode: 'Markdown' });
            const balasan = await tagihanController.cariByNIM(nim, tahunAkademik);

            bot.sendMessage(chatId, balasan, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]}
            });
        }

        // --- FLOW: Input Nomor Pendaftaran (Cek Tagihan PMB) ---
        else if (step === 'waiting_no_pendaftaran') {
            const noDaftar = text.trim().toUpperCase();

            const previousMenu = state.previousMenu || 'main';
            clearTimer(chatId);
            userState.set(chatId, { previousMenu });

            await bot.sendMessage(chatId, '🔍 *Sedang mengambil data tagihan PMB...*', { parse_mode: 'Markdown' });
            const balasan = await tagihanController.cariByNoPendaftaran(noDaftar);

            bot.sendMessage(chatId, balasan, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [
                    [{ text: '🔄 Cari Lagi', callback_data: 'cari_lagi_pmb' }],
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]}
            });
        }
    });
}

module.exports = register;
