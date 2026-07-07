require('dotenv').config();
const { TelegramBot } = require('node-telegram-bot-api');

// Mengambil token dari konfigurasi .env
const token = process.env.TELEGRAM_TOKEN;

// Validasi token
if (!token || token === 'masukkan_token_api_bot_anda_di_sini') {
    console.error('❌ ERROR: Token Telegram tidak valid!');
    console.error('   Silakan dapatkan token dari @BotFather di Telegram');
    console.error('   lalu isi di file .env: TELEGRAM_TOKEN=token_anda');
    process.exit(1);
}

// Inisialisasi bot (tanpa polling dulu)
const bot = new TelegramBot(token, { polling: false });

// Fungsi untuk memulai bot dengan retry
async function startBot() {
    // Hapus semua sesi yang mungkin tersisa
    await bot.deleteWebhook({ drop_pending_updates: true });
    console.log('🔌 Webhook dihapus, membersihkan update tertunda...');

    // Tunggu sebentar agar sesi lama benar-benar terputus
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('🔁 Memulai polling...');

    // Inisialisasi database MySQL
    await initDB();

    // Opsi polling: timeout lebih pendek agar reconnect lebih cepat
    await bot.startPolling({
        polling: {
            interval: 300,
            params: {
                timeout: 10  // long polling timeout 10 detik
            }
        }
    });

    console.log('✅ Bot Telegram berhasil dijalankan dan siap menerima perintah...');

    // Hapus semua command suggestions — user pakai tombol saja
    await bot.setMyCommands([]);
}

// Jalankan bot dengan retry jika gagal
startBot().catch(async (err) => {
    console.error('❌ Gagal memulai bot:', err.message);
    if (err.message.includes('409')) {
        console.error('   ⏳ Konflik terdeteksi, mencoba ulang dalam 5 detik...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        return startBot(); // retry sekali
    }
    process.exit(1);
});

// Error handling untuk polling
bot.on('polling_error', (error) => {
    const msg = error.message || '';
    // 409 = conflict, log & biarkan library retry
    if (msg.includes('409')) {
        console.warn('⚠️  Polling conflict (409), akan retry otomatis...');
        return;
    }
    // EFATAL / connection errors
    if (msg.includes('EFATAL') || msg.includes('ECONNREFUSED')) {
        console.error('❌ Koneksi terputus:', msg);
        return;
    }
    console.error('❌ Polling error:', msg);
});

// Graceful shutdown — bersihkan saat Ctrl+C
process.once('SIGINT', () => {
    console.log('\n🛑 Mematikan bot...');
    bot.stopPolling()
        .then(() => console.log('👋 Bot berhenti.'))
        .finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
    bot.stopPolling().finally(() => process.exit(0));
});

// ============================================================
// IMPORT CONTROLLER & DATABASE
// ============================================================
const { pool, initDB } = require('./config/database');
const tagihanController = require('./controllers/tagihan');

// ============================================================
// KONTROL AKSES ADMIN
// ============================================================
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

function isAdmin(chatId) {
    return ADMIN_IDS.includes(String(chatId));
}

// ============================================================
// HELPER: Bangun menu utama (berbeda untuk admin & user biasa)
// ============================================================
function buildMainMenu(chatId) {
    const buttons = [
        [{ text: '📝 Layanan PMB', url: 'https://penmaru.umjambi.ac.id' }],
        [{ text: '💰 Layanan Keuangan', callback_data: 'menu_keuangan' }],
        [{ text: '📚 Layanan Akademik', callback_data: 'menu_akademik' }],
    ];

    // Admin dapat akses laporan PMB
    if (isAdmin(chatId)) {
        buttons.push([{ text: '📊 Laporan PMB', callback_data: 'rekap_pmb' }]);
    }

    return { reply_markup: { inline_keyboard: buttons } };
}

// ============================================================
// STATE SEDERHANA UNTUK FLOW INTERAKTIF
// ============================================================
// Menyimpan state percakapan per chatId
// Contoh: { step: 'waiting_npm', timer: Timeout, previousMenu: 'menu_keuangan' }
const userState = new Map();

// Bersihkan state user (tanpa menghapus previousMenu)
function clearTimer(chatId) {
    const state = userState.get(chatId);
    if (state && state.timer) clearTimeout(state.timer);
}

// Reset penuh state user
function resetUserState(chatId) {
    clearTimer(chatId);
    userState.delete(chatId);
}

// ============================================================
// LISTENER INPUT UTAMA — Semua command & flow disini
// ============================================================
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

// ============================================================
// CALLBACK QUERY — Menangani klik tombol inline
// ============================================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    // Akhiri loading spinner di tombol
    await bot.answerCallbackQuery(query.id);

    // --- MENU AKADEMIK ---
    if (data === 'menu_akademik') {
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

    // --- SUB-MENU KEUANGAN ---
    else if (data === 'menu_keuangan') {
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

    // --- � CARI LAGI PMB ---
    else if (data === 'cari_lagi_pmb') {
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

    // --- �🔍 CEK TAGIHAN PMB → minta nomor pendaftaran ---
    else if (data === 'cek_tagihan_pmb') {
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

    // --- 🔒 REKAP PMB (admin only) ---
    else if (data === 'rekap_pmb') {
        if (!isAdmin(chatId)) {
            return bot.editMessageText(`🚫 Anda tidak memiliki akses ke fitur ini.`, { chat_id: chatId, message_id: messageId });
        }

        clearTimer(chatId);
        userState.set(chatId, { currentMenu: 'rekap_pmb', previousMenu: 'main' });

        const rp = (n) => 'Rp ' + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

        // PMB = npm LIKE 'UMJA%', belum lunas = nominal_terbayar < nominal_ditagih
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

        const lines = ['� *Laporan Penerimaan Mahasiswa Baru*\n'];
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

    // --- ⬅ KEMBALI (back 1 level) ---
    else if (data === 'back') {
        const currentState = userState.get(chatId) || {};
        const previousMenu = currentState.previousMenu || 'main';
        const target = previousMenu === 'main' ? 'menu_utama' : previousMenu;

        // Pantulkan ke handler menu target
        bot.emit('callback_query', { ...query, data: target });
    }

    // --- 🏠 MENU UTAMA (langsung ke root) ---
    else if (data === 'menu_utama') {
        resetUserState(chatId);

        bot.editMessageText(
            `📋 *Menu Utama*\n\nSilakan pilih layanan yang diinginkan:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...buildMainMenu(chatId) }
        );
    }
});

// ============================================================
// DONE — semua command & flow di satukan di on('message') di atas
// ============================================================