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
    const status = lunas ? 'LUNAS' : 'BELUM LUNAS';

    let jatuhTempo = '-';
    if (item.waktu_berakhir) {
        jatuhTempo = new Date(item.waktu_berakhir).toISOString().split('T')[0];
    }

    return [
        `🧾 *Detail Tagihan*`,
        ``,
        `📌 No. Tagihan      : \`${item.nomor_tagihan}\``,
        `🎓 NPM              : \`${item.npm}\``,
        `👤 Nama Mahasiswa   : ${item.nama_mahasiswa}`,
        `📚 Fakultas         : ${item.nama_fakultas}`,
        `📖 Program Studi     : ${item.nama_program_studi}`,
        `🏷️  Jenis Tagihan    : ${item.jenis_tagihan}`,
        `💰 Total Tagihan    : ${formatRupiah(item.nominal_ditagih)}`,
        `💳 Total Dibayarkan : ${formatRupiah(item.nominal_terbayar)}`,
        `📅 Batas Pembayaran : ${jatuhTempo}`,
        `📊 Status           : ${icon} ${status}`,
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
    if (items.length === 0) return '📭 Tidak ditemukan data tagihan.';

    const mhs = items[0];
    const totalDitagih = items.reduce((s, i) => s + Number(i.nominal_ditagih), 0);
    const totalTerbayar = items.reduce((s, i) => s + Number(i.nominal_terbayar), 0);

    const header = [
        `🎓 *Informasi Tagihan Mahasiswa*`,
        ``,
        `👤 Nama           : *${mhs.nama_mahasiswa}*`,
        `🔢 NPM            : \`${mhs.npm}\``,
        `📖 Program Studi   : ${mhs.nama_program_studi}`,
        ``,
        `📋 *Rincian Tagihan*`,
    ].join('\n');

    const list = items.map((item, i) => `${i + 1}. ${formatItem(item)}`).join('\n');
    const footer = `\n──────────────────\n💰 *Total Tagihan*     : ${formatRupiah(totalDitagih)}\n💳 *Total Dibayarkan*  : ${formatRupiah(totalTerbayar)}`;

    return header + '\n' + list + footer;
}

// Format tagihan PMB (1 tagihan, ringkas)
function formatPMB(item) {
    const lunas = isLunas(item);
    const icon = lunas ? '✅' : '❌';
    const status = lunas ? 'LUNAS' : 'BELUM LUNAS';

    let jatuhTempo = '-';
    if (item.waktu_berakhir) {
        jatuhTempo = new Date(item.waktu_berakhir).toISOString().split('T')[0];
    }

    return [
        `🧾 *Tagihan PMB*`,
        ``,
        `� Nomor Pendaftaran  : \`${item.npm}\``,
        `👤 Nama               : ${item.nama_mahasiswa}`,
        `📖 Program Studi       : ${item.nama_program_studi}`,
        `🔖 No. Tagihan        : \`${item.nomor_tagihan}\``,
        `💰 Total Tagihan      : ${formatRupiah(item.nominal_ditagih)}`,
        `💳 Total Dibayarkan   : ${formatRupiah(item.nominal_terbayar)}`,
        `📅 Batas Pembayaran   : ${jatuhTempo}`,
        `📊 Status             : ${icon} ${status}`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// QUERY
// ---------------------------------------------------------------------------

/**
 * Cari SEMUA tagihan berdasarkan NPM (dan opsional Tahun Akademik)
 */
async function cariByNIM(npm, tahunAkademik = null) {
    let query = `SELECT * FROM ${TABLE} WHERE npm = ?`;
    const params = [npm];

    if (tahunAkademik) {
        query += ` AND tahun_akademik = ?`;
        params.push(tahunAkademik);
    }

    query += ` ORDER BY created_at DESC`;

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) {
        const extra = tahunAkademik ? ` dan Tahun Akademik \`${tahunAkademik}\`` : '';
        return `❌ Data tagihan dengan NPM \`${npm}\`${extra} tidak ditemukan.\n\nSilakan periksa kembali NPM dan Tahun Akademik Anda.`;
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
        return `❌ Data tagihan dengan Nomor Pendaftaran \`${noDaftar}\` tidak ditemukan.\n\nSilakan periksa kembali nomor pendaftaran Anda.`;
    }
    // Tampilkan setiap tagihan dengan format terpisah
    return rows.map((item, i) => {
        const prefix = rows.length > 1 ? `📋 *Tagihan ${i + 1} dari ${rows.length}*\n\n` : '';
        return prefix + formatPMB(item);
    }).join('\n\n──────────────────\n\n');
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
        return `❌ Data tagihan dengan nomor \`${noTagihan}\` tidak ditemukan.`;
    }
    return formatDetail(hasil);
}

module.exports = {
    cariByIdTagihan,
    cariByNIM,
    cariByNoPendaftaran,
};
