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

// ============================================================
// IMPORT & REGISTER HANDLERS
// ============================================================
const { initDB } = require('./config/database');

require('./handlers/message')(bot);
require('./handlers/keuangan')(bot);
require('./handlers/akademik')(bot);
require('./handlers/rekap')(bot);
require('./handlers/navigation')(bot);

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
// DONE — semua handler terpisah per modul
// ============================================================
