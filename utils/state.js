// ============================================================
// STATE SEDERHANA UNTUK FLOW INTERAKTIF
// ============================================================
// Menyimpan state percakapan per chatId
// Contoh: { step: 'waiting_npm', timer: Timeout, previousMenu: 'menu_keuangan' }
const userState = new Map();

// Bersihkan timer user (tanpa menghapus previousMenu)
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
        [{ text: '📝 Informasi PMB', url: 'https://penmaru.umjambi.ac.id' }],
        [{ text: '💰 Layanan Keuangan', callback_data: 'menu_keuangan' }],
        [{ text: '📚 Layanan Akademik', callback_data: 'menu_akademik' }],
    ];

    // Admin dapat akses laporan PMB
    if (isAdmin(chatId)) {
        buttons.push([{ text: '📊 Laporan PMB', callback_data: 'rekap_pmb' }]);
    }

    return { reply_markup: { inline_keyboard: buttons } };
}

module.exports = { userState, clearTimer, resetUserState, isAdmin, buildMainMenu, ADMIN_IDS };
