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
                `Halo! Saya asisten digital *Universitas Muhammadiyah Jambi* yang siap membantu Anda. 😊\n\n` +
                `*Layanan yang tersedia:*\n` +
                `• 📝 Informasi PMB\n` +
                `• 💳 Layanan Keuangan\n` +
                `• 📚 Layanan Akademik\n` +
                `• 🎓 Layanan Wisuda\n` +
                `• 📄 Layanan Surat & Administrasi\n` +
                `• 📢 Informasi Kampus\n\n` +
                `Silakan pilih layanan yang Anda butuhkan di bawah ini ya 👇`,
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
                    `❌ *Proses dibatalkan.*\n\nTidak masalah! Anda bisa mulai lagi kapan saja. Silakan pilih menu di bawah ini:`,
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
                    '⚠️ *Format Tahun Akademik tidak valid.*\n\nGunakan format: *Tahun + Semester*\n✅ 20231\n✅ 20232\n\nSilakan coba masukkan kembali ya:',
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
                `📅 Tahun Akademik: *${tahunAkademik}*\n\nTerima kasih! Sekarang silakan masukkan *Nomor Pokok Mahasiswa (NPM)* Anda ya.\n\n_Contoh: S12560001_`,
                { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]}}
            );
        }

        // --- FLOW: Input NPM (Cek Tagihan Mahasiswa) ---
        else if (step === 'waiting_npm') {
            const nim = text.trim();
            if (!/^[\dA-Za-z]+$/.test(nim)) {
                bot.sendMessage(chatId, '⚠️ Format NPM tidak dikenali. Mohon periksa kembali NPM Anda ya:', { parse_mode: 'Markdown' });
                return;
            }

            const previousMenu = state.previousMenu || 'main';
            const tahunAkademik = state.tahunAkademik || null;
            clearTimer(chatId);
            userState.set(chatId, { previousMenu });

            await bot.sendMessage(chatId, '🔍 *Mohon tunggu, sedang mengambil data tagihan Anda...*', { parse_mode: 'Markdown' });
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

            await bot.sendMessage(chatId, '🔍 *Mohon tunggu, sedang mengambil data tagihan PMB Anda...*', { parse_mode: 'Markdown' });
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
