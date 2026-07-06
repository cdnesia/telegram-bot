const { pool } = require('../config/database');

/**
 * Controller Tagihan
 * Mapping ke tabel `tagihan` di database MySQL.
 */

const TABLE = 'tagihan';

// Format mata uang Rupiah
function formatRupiah(angka) {
    return 'Rp ' + Number(angka).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Status: Y = Belum Lunas, T = Lunas, atau cek nominal_terbayar >= nominal_ditagih
function isLunas(item) {
    if (item.status_aktif === 'T') return true;
    if (Number(item.nominal_terbayar) >= Number(item.nominal_ditagih)) return true;
    return false;
}

// ---------------------------------------------------------------------------
// FORMAT TAMPILAN
// ---------------------------------------------------------------------------

// Detail 1 tagihan (untuk cariByIdTagihan)
function formatDetail(item) {
    const lunas = isLunas(item);
    const icon = lunas ? '✅' : '❌';
    const status = lunas ? 'Lunas' : 'Belum Lunas';

    let jatuhTempo = '-';
    if (item.waktu_berakhir) {
        jatuhTempo = new Date(item.waktu_berakhir).toISOString().split('T')[0];
    }

    return [
        `🧾 *Detail Tagihan*`,
        ``,
        `📌 No. Tagihan   : \`${item.nomor_tagihan}\``,
        `🎓 NPM           : \`${item.npm}\``,
        `👤 Nama          : ${item.nama_mahasiswa}`,
        `📚 Fakultas      : ${item.nama_fakultas}`,
        `📖 Prodi         : ${item.nama_program_studi}`,
        `🏷️  Jenis         : ${item.jenis_tagihan}`,
        `💰 Ditagih       : ${formatRupiah(item.nominal_ditagih)}`,
        `💳 Terbayar      : ${formatRupiah(item.nominal_terbayar)}`,
        `📅 Jatuh Tempo   : ${jatuhTempo}`,
        `📊 Status        : ${icon} ${status}`,
    ].join('\n');
}

// Format 1 baris ringkas
function formatItem(item) {
    const lunas = isLunas(item);
    const icon = lunas ? '✅' : '❌';
    let jatuhTempo = '-';
    if (item.waktu_berakhir) {
        jatuhTempo = new Date(item.waktu_berakhir).toISOString().split('T')[0];
    }
    return `${icon} ${item.jenis_tagihan.padEnd(8)} — ${formatRupiah(item.nominal_ditagih).padEnd(14)} — ${jatuhTempo}`;
}

// Format daftar tagihan per mahasiswa
function formatDaftar(items) {
    if (items.length === 0) return '📭 Tidak ada tagihan ditemukan.';

    const mhs = items[0];
    const totalDitagih = items.reduce((s, i) => s + Number(i.nominal_ditagih), 0);
    const totalTerbayar = items.reduce((s, i) => s + Number(i.nominal_terbayar), 0);

    const header = [
        `🎓 *Tagihan Mahasiswa*`,
        ``,
        `👤 Nama     : *${mhs.nama_mahasiswa}*`,
        `🔢 NPM      : \`${mhs.npm}\``,
        `📚 Prodi    : ${mhs.nama_program_studi}`,
        ``,
        `📋 *Rincian Tagihan*`,
    ].join('\n');

    const list = items.map((item, i) => `${i + 1}. ${formatItem(item)}`).join('\n');
    const footer = `\n───────────────\n💰 *Total Ditagih*  : ${formatRupiah(totalDitagih)}\n💳 *Total Terbayar* : ${formatRupiah(totalTerbayar)}`;

    return header + '\n' + list + footer;
}

// Format tagihan PMB (1 mahasiswa baru)
function formatPMB(item) {
    const lunas = isLunas(item);
    const icon = lunas ? '✅' : '❌';
    const status = lunas ? 'Lunas' : 'Belum Lunas';

    let jatuhTempo = '-';
    if (item.waktu_berakhir) {
        jatuhTempo = new Date(item.waktu_berakhir).toISOString().split('T')[0];
    }

    return [
        `🧾 *Tagihan PMB*`,
        ``,
        `📌 No. Pendaftaran : \`${item.npm}\``,
        `👤 Nama            : ${item.nama_mahasiswa}`,
        `📚 Prodi           : ${item.nama_program_studi}`,
        `🏛️  Fakultas        : ${item.nama_fakultas}`,
        `💰 Ditagih         : ${formatRupiah(item.nominal_ditagih)}`,
        `💳 Terbayar        : ${formatRupiah(item.nominal_terbayar)}`,
        `📅 Jatuh Tempo     : ${jatuhTempo}`,
        `📊 Status          : ${icon} ${status}`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// QUERY
// ---------------------------------------------------------------------------

/**
 * Cari SEMUA tagihan berdasarkan NPM
 */
async function cariByNIM(npm) {
    const [rows] = await pool.execute(
        `SELECT * FROM ${TABLE} WHERE npm = ? ORDER BY created_at DESC`,
        [npm]
    );
    if (rows.length === 0) {
        return `❌ Tidak ada tagihan untuk NPM \`${npm}\`.`;
    }
    return formatDaftar(rows);
}

/**
 * Cari tagihan PMB berdasarkan nomor pendaftaran (= kolom npm)
 */
async function cariByNoPendaftaran(noDaftar) {
    const [rows] = await pool.execute(
        `SELECT * FROM ${TABLE} WHERE npm = ? ORDER BY created_at DESC`,
        [noDaftar]
    );
    if (rows.length === 0) {
        return `❌ Tidak ditemukan tagihan untuk nomor pendaftaran \`${noDaftar}\`.`;
    }
    if (rows.length === 1) {
        return formatPMB(rows[0]);
    }
    return formatDaftar(rows);
}

/**
 * Cari detail tagihan berdasarkan nomor tagihan
 */
async function cariByIdTagihan(noTagihan) {
    const [rows] = await pool.execute(
        `SELECT * FROM ${TABLE} WHERE nomor_tagihan = ?`,
        [noTagihan]
    );
    const hasil = rows[0];
    if (!hasil) {
        return `❌ Tagihan \`${noTagihan}\` tidak ditemukan.`;
    }
    return formatDetail(hasil);
}

module.exports = {
    cariByIdTagihan,
    cariByNIM,
    cariByNoPendaftaran,
};
