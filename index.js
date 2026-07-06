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
        [{ text: '📚 Akademik', callback_data: 'menu_akademik' }, { text: '💰 Keuangan', callback_data: 'menu_keuangan' }],
    ];

    // Admin dapat akses rekap PMB
    if (isAdmin(chatId)) {
        buttons.push([{ text: '🔒 Rekap PMB', callback_data: 'rekap_pmb' }]);
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
// PERINTAH TELEGRAM
// ============================================================

// /start — Menu utama dengan tombol
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    resetUserState(chatId);

    bot.sendMessage(chatId,
        `👋 *Halo! Selamat datang di Bot Kampus.*\n\nSilakan pilih menu di bawah ini:`,
        { parse_mode: 'Markdown', ...buildMainMenu(chatId) }
    );
});

// /menu — Kembali ke menu utama
bot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    resetUserState(chatId);

    bot.sendMessage(chatId,
        `📋 *Menu Utama*\n\nSilakan pilih:`,
        { parse_mode: 'Markdown', ...buildMainMenu(chatId) }
    );
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
                    [{ text: '🧾 Cek Tagihan', callback_data: 'cek_tagihan' }],
                    [{ text: '🔍 Cek Tagihan PMB', callback_data: 'cek_tagihan_pmb' }],
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]
            }
        };

        bot.editMessageText(
            `📚 *Akademik*\n\nSilakan pilih layanan akademik:`,
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
                    [{ text: '🧾 Cek Tagihan', callback_data: 'cek_tagihan' }],
                    [{ text: '🔍 Cek Tagihan PMB', callback_data: 'cek_tagihan_pmb' }],
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]
            }
        };

        bot.editMessageText(
            `💰 *Keuangan*\n\nSilakan pilih layanan keuangan:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...keyboard }
        );
    }

    // --- CEK TAGIHAN → minta NPM ---
    else if (data === 'cek_tagihan') {
        const currentState = userState.get(chatId) || {};
        // Simpan parent menu saat ini sebagai previousMenu
        const parentMenu = currentState.currentMenu || 'main';

        clearTimer(chatId);

        // Set state: menunggu input NPM, simpan parent untuk back
        const timer = setTimeout(() => {
            userState.delete(chatId);
            bot.sendMessage(chatId, '⏰ *Waktu habis.* Silakan pilih menu lagi dengan /menu.', { parse_mode: 'Markdown' });
        }, 120_000);

        userState.set(chatId, { step: 'waiting_npm', timer, previousMenu: parentMenu });

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]
            }
        };

        bot.editMessageText(
            `🎓 *Cek Tagihan Mahasiswa*\n\nSilakan *masukkan NPM* kamu:\n\n_Contoh: 20241001_`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...keyboard }
        );
    }

    // --- 🔍 CEK TAGIHAN PMB → minta nomor pendaftaran ---
    else if (data === 'cek_tagihan_pmb') {
        const currentState = userState.get(chatId) || {};
        const parentMenu = currentState.currentMenu || 'main';

        clearTimer(chatId);

        const timer = setTimeout(() => {
            userState.delete(chatId);
            bot.sendMessage(chatId, '⏰ *Waktu habis.* Silakan pilih menu lagi dengan /menu.', { parse_mode: 'Markdown' });
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
            `🔍 *Cek Tagihan PMB*\n\nSilakan *masukkan nomor pendaftaran* kamu:\n\n_Contoh: UMJA202610001_`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...keyboard }
        );
    }

    // --- 🔒 REKAP PMB (admin only) ---
    else if (data === 'rekap_pmb') {
        if (!isAdmin(chatId)) {
            return bot.editMessageText(`🚫 Akses ditolak.`, { chat_id: chatId, message_id: messageId });
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

        const lines = ['🔒 *Rekap Tagihan PMB*\n'];
        if (rekap.length === 0) {
            lines.push('📭 Semua tagihan PMB sudah lunas! 🎉');
        } else {
            rekap.forEach((r, i) => {
                const m = mhsPerProdi.find(x => x.prodi === r.prodi);
                lines.push(`*${i + 1}. ${r.prodi}*`);
                lines.push(`   👥 ${m ? m.total_mhs : 0} mhs  │  📄 ${r.total} tagihan  │  💰 ${rp(r.tunggakan)}`);
            });
            lines.push('');
            lines.push('─────────────────────────');
            lines.push(`📊 *Total*  :  👥 ${t.mhs} mhs  │  📄 ${t.tagihan} tagihan  │  💰 ${rp(t.tunggakan)}`);
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
            `📋 *Menu Utama*\n\nSilakan pilih:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...buildMainMenu(chatId) }
        );
    }
});

// /batal — Membatalkan input NPM
bot.onText(/\/batal/, (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);

    if (state && (state.step === 'waiting_npm' || state.step === 'waiting_no_pendaftaran')) {
        resetUserState(chatId);

        bot.sendMessage(chatId,
            `❌ *Dibatalkan.*\n\n📋 Kembali ke menu utama:`,
            { parse_mode: 'Markdown', ...buildMainMenu(chatId) }
        );
    } else {
        bot.sendMessage(chatId, '🤷 Tidak ada proses yang sedang berjalan.');
    }
});

// ============================================================
// LISTENER INPUT UNTUK FLOW CEK TAGIHAN (NPM / ID tagihan / No Pendaftaran)
// ============================================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Abaikan command
    if (!text || text.startsWith('/')) return;

    const state = userState.get(chatId);
    if (!state) return;

    const step = state.step;

    // --- FLOW: Input NPM (Cek Tagihan Mahasiswa) ---
    if (step === 'waiting_npm') {
        const nim = text.trim();
        if (!/^[\dA-Za-z]+$/.test(nim)) {
            bot.sendMessage(chatId, '⚠️ NPM tidak valid. Coba lagi:', { parse_mode: 'Markdown' });
            return;
        }

        const previousMenu = state.previousMenu || 'main';
        clearTimer(chatId);
        userState.set(chatId, { previousMenu });

        // Kirim "Mencari..." dulu, tunggu sampai terkirim
        await bot.sendMessage(chatId, '🔍 *Mencari tagihan...*', { parse_mode: 'Markdown' });

        // Baru kirim hasil detail
        const balasan = await tagihanController.cariByNIM(nim);

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]
            }
        };

        bot.sendMessage(chatId, balasan, { parse_mode: 'Markdown', ...keyboard });
    }

    // --- FLOW: Input Nomor Pendaftaran (Cek Tagihan PMB) ---
    else if (step === 'waiting_no_pendaftaran') {
        const noDaftar = text.trim().toUpperCase();

        const previousMenu = state.previousMenu || 'main';
        clearTimer(chatId);
        userState.set(chatId, { previousMenu });

        // Kirim "Mencari..." dulu, tunggu sampai terkirim
        await bot.sendMessage(chatId, '🔍 *Mencari tagihan PMB...*', { parse_mode: 'Markdown' });

        // Baru kirim hasil detail
        const balasan = await tagihanController.cariByNoPendaftaran(noDaftar);

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅ Kembali', callback_data: 'back' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }],
                ]
            }
        };

        bot.sendMessage(chatId, balasan, { parse_mode: 'Markdown', ...keyboard });
    }
});