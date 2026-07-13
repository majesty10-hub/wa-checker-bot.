const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8900613624:AAGHTnoVyf_Uia52E_fYNTDa-sYk9EJuzic";

const BotClass = TelegramBot.default || TelegramBot;
const bot = new BotClass(TELEGRAM_BOT_TOKEN, { polling: true });
let sock = null;
let isConnecting = false;

let cacheFileData = {};
let cacheHasilScan = {};

function sendMenu(chatId) {
    bot.sendMessage(chatId, "🤖 ─── 𝕎𝕊 ℂℍ𝔼ℂ𝕂𝔼ℝ 𝕧𝟛.𝟠 ─── 🤖\n« 𝘾𝙤𝙧ε 𝙎𝙮𝙨𝙩ε𝙢 𝙊𝙣λ𝙞𝙣ε »\n\n⚙️ Silakan pilih modul kendali di bawah untuk mengelola perangkat:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚡ Sambungkan Perangkat (Pairing)", callback_data: "sambungkan" }],
                [{ text: "📊 Monitor Status Sistem", callback_data: "status" }]
            ]
        }
    });
}

async function hubungkanKeWhatsApp(nomorHPTumbal = null, chatId = null, isRetry = false, forceNewSession = false) {
    if (isConnecting && !isRetry && !forceNewSession) return;
    isConnecting = true;

    if (forceNewSession) {
        if (sock) {
            try { sock.logout().catch(() => {}); sock.end(); } catch(e){}
        }
        if (fs.existsSync('/data/sesi_wa')) {
            fs.rmSync('/data/sesi_wa', { recursive: true, force: true });
        }
        await delay(1000);
    }

    const { state, saveCreds } = await useMultiFileAuthState('/data/sesi_wa');
    
    sock = makeWASocket({ 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut) {
                console.log("[🚨 SYSTEM WARNING] Sender VALID Banned/Logout! Menghapus sesi...");
                if (fs.existsSync('/data/sesi_wa')) {
                    fs.rmSync('/data/sesi_wa', { recursive: true, force: true });
                }
                
                if (chatId) {
                    let teksAlert = `🚨 🛑 **[CRITICAL ALERT - SENDER BANNED]** 🚨\n\n`;
                    teksAlert += `⚠️ Akun WhatsApp *Sender/Tumbal* Anda resmi terblokir oleh pihak WhatsApp!\n\n`;
                    teksAlert += `🛠️ **Tindakan Otomatis:** Sistem telah mendepak dan menghapus folder \`sesi_wa\` secara instan.\n\n`;
                    teksAlert += `👉 Silakan siapkan nomor tumbal yang baru dan ketuk tombol di bawah untuk menghubungkannya:`;
                    
                    bot.sendMessage(chatId, teksAlert, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "⚡ Hubungkan Sender Baru", callback_data: "sambungkan" }]
                            ]
                        }
                    });
                }
            } 
            else {
                if (state.creds && state.creds.me && state.creds.me.id) {
                    console.log(`[SYSTEM] Sesi terputus temporer (Code: ${statusCode || 'Transisi'}). Mencoba hubungkan ulang...`);
                    await delay(5000); 
                    hubungkanKeWhatsApp(null, chatId, true, false);
                } else {
                    console.log("[SYSTEM] Menunggu proses otentikasi pairing selesai di aplikasi WhatsApp Anda...");
                }
            }
        } 
        else if (connection === 'open') {
            isConnecting = false;
            console.log(`[SYSTEM] WhatsApp Client Connected: +${sock.user.id.split(':')[0]}`);
            if (chatId) {
                bot.sendMessage(chatId, `🛸 **[CONNECTION ESTABLISHED]**\n\n🟢 **MAINFRAME ACTIVE 100%**\n🤖 Node ID: \`+${sock.user.id.split(':')[0]}\`\n🛰️ Status: Siap digunakan!`, { parse_mode: 'Markdown' });
            }
        }
    });

    if (nomorHPTumbal) {
        try {
            let nomorBersih = nomorHPTumbal.replace(/[^0-9]/g, '');
            if (nomorBersih.startsWith('08')) nomorBersih = '628' + nomorBersih.slice(2);
            
            await delay(2500);
            
            if (chatId) bot.sendMessage(chatId, `🛰️ **[REQUESTING PAIRING CODE]**\nMengirim enkripsi ke target \`+${nomorBersih}\`...`, { parse_mode: 'Markdown' });
            
            const code = await sock.requestPairingCode(nomorBersih);
            const teksKode = code?.match(/.{1,4}/g)?.join('-') || code;
            if (chatId) bot.sendMessage(chatId, `🔑 ── **AUTENTIKASI ROBOTIK** ── 🔑\n\nMasukkan kode otorisasi berikut ke WhatsApp perangkat Anda:\n\n👉  \`${teksKode}\`  👈\n\n🎛️ _Menunggu sinkronisasi database..._`, { parse_mode: 'Markdown' });
        } catch (err) {
            isConnecting = false;
            console.error(err);
            if (chatId) bot.sendMessage(chatId, "❌ **[ERROR]** Gagal mendapatkan kode pairing. Silakan coba lagi.");
        }
    }
}

async function prosesCekNomor(targetRaw) {
    let target = targetRaw.toString().trim().replace(/[^0-9]/g, '');
    if (target.startsWith('08')) target = '628' + target.slice(2);
    if (target.length < 7) return { status: 'TIDAK_TERDAFTAR', nomor: targetRaw };
    
    const jid = target + '@s.whatsapp.net';
    try {
        const [result] = await sock.onWhatsApp(jid);
        if (result && result.exists) {
            let tipeAkun = "REGULAR AKUN 👤";
            let bio = "*(Privacy Restricted/Kosong)*";
            let waktuBio = "Tidak Diketahui";

            if (result.biz === true || (result.jid && result.jid.includes('biz'))) {
                tipeAkun = "BISNIS AKUN 🏢";
            }

            try {
                const dapatkanProfilBisnisMendalam = () => Promise.race([
                    sock.getBusinessProfile(result.jid),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000))
                ]);
                const profilBisnis = await dapatkanProfilBisnisMendalam();
                if (profilBisnis && Object.keys(profilBisnis).length > 0) {
                    tipeAkun = "BISNIS AKUN 🏢";
                }
            } catch (errBiz) {}

            try {
                const ambilStatusBioDenganTimeout = () => Promise.race([
                    sock.fetchStatus(result.jid),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2500))
                ]);
                const statusData = await ambilStatusBioDenganTimeout();
                if (statusData && statusData.status) {
                    bio = statusData.status;
                    if (statusData.setAt) {
                        waktuBio = new Date(statusData.setAt).toLocaleDateString('id-ID', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit'
                        }) + " WIB";
                    }
                }
            } catch (e) {}

            return { status: 'TERDAFTAR', nomor: target, tipe: tipeAkun, bio: bio, waktu: waktuBio };
        }
        return { status: 'TIDAK_TERDAFTAR', nomor: target };
    } catch (err) {
        return { status: 'TIDAK_TERDAFTAR', nomor: target };
    }
}

async function jalankanBulkCekFile(chatId, messageId, daftarNomor, modePilihan) {
    let totalNomorAwal = daftarNomor.length;
    if (modePilihan === 'random') {
        daftarNomor = daftarNomor.sort(() => 0.5 - Math.random()).slice(0, 100);
    }
    const totalNomor = daftarNomor.length;
    
    await bot.editMessageText(`📥 **[PROCESSING DATASET]**\nMemulai analisis data dalam mode: \`${modePilihan.toUpperCase()}\`. Total target: \`${totalNomor}\` nomor...`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
    }).catch(() => {});
    
    try {
        let listBisnis = [];
        let listBiasa = [];
        let terdaftarCount = 0, tidakTerdaftarCount = 0, counter = 0;
        let logDetailTeks = ""; 

        for (let item of daftarNomor) {
            if (!sock || !sock.user) {
                bot.sendMessage(chatId, "🚨 **[SCAN ABORTED]** Pemindaian dihentikan karena koneksi sender mendadak terputus/terblokir!");
                return;
            }

            counter++;
            const res = await prosesCekNomor(item);
            if (res.status === 'TERDAFTAR') {
                terdaftarCount++;
                logDetailTeks += `[OK - TERDAFTAR] -----------------------------------------------------------------------\n`;
                logDetailTeks += ` |- Node ID    : +${res.nomor}\n`;
                logDetailTeks += ` |- Klasifikasi: ${res.tipe}\n`;
                logDetailTeks += ` |- Set Bio    : ${res.waktu}\n`;
                logDetailTeks += ` |- Data Bio   : "${res.bio}"\n\n`;

                if (res.tipe.includes('BISNIS')) {
                    listBisnis.push(`+${res.nomor}`);
                } else {
                    listBiasa.push(`+${res.nomor}`);
                }
            } else { 
                tidakTerdaftarCount++; 
            }

            if (counter % 5 === 0 || counter === totalNomor) {
                let persentase = ((counter / totalNomor) * 100).toFixed(1);
                let updateTeksBot = `🤖 **[ANALYZING DATABASE]**\n\n`;
                updateTeksBot += `📊 Progress: \`${counter}\` / \`${totalNomor}\` (\`${persentase}%\`)\n`;
                updateTeksBot += `🏢 Nomor Bisnis: \`${listBisnis.length}\`\n`;
                updateTeksBot += `👤 Nomor Biasa: \`${listBiasa.length}\`\n`;
                updateTeksBot += `🔴 Nomor Inaktif: \`${tidakTerdaftarCount}\``;

                await bot.editMessageText(updateTeksBot, { 
                    chat_id: chatId, 
                    message_id: messageId, 
                    parse_mode: 'Markdown' 
                }).catch(() => {});
            }
            await delay(400);
        }
        
        cacheHasilScan[chatId] = {
            totalAwal: totalNomorAwal,
            totalProses: totalNomor,
            mode: modePilihan,
            bisnis: listBisnis,
            biasa: listBiasa,
            matiCount: tidakTerdaftarCount,
            logDetail: logDetailTeks
        };

        if (modePilihan === 'random') {
            let menuOutput = `✨ **[PEMINDAIAN DATASET SELESAI]**\n\n📊 Total Target: \`${totalNomor}\` nomor\n🏢 Total Bisnis: \`${listBisnis.length}\`\n👤 Total Biasa: \`${listBiasa.length}\`\n🔴 Total Mati: \`${tidakTerdaftarCount}\` _(Dibuang ke laut)_\n\n`;
            menuOutput += `🎛️ **PILIH METODE PENGIRIMAN HASIL:**`;
            
            await bot.editMessageText(menuOutput, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📄 Kirim Teks ke Chat", callback_data: "output_text" }],
                        [{ text: "📂 Ekspor File .txt", callback_data: "output_file" }]
                    ]
                }
            });
        } else {
            await kirimHasilSebagaiFile(chatId, messageId);
        }
    } catch(e) { 
        bot.sendMessage(chatId, "❌ **[CRITICAL SYSTEM ERROR]** Gagal memproses data file."); 
    }
}

async function kirimHasilSebagaiTeks(chatId, messageId) {
    const data = cacheHasilScan[chatId];
    if (!data) return bot.sendMessage(chatId, "❌ Data kedaluwarsa.");

    await bot.deleteMessage(chatId, messageId).catch(() => {});

    let teksChat = `🔮 ── **𝕛𝔼𝕁𝔼𝕊𝕋 ℂℍ𝔼ℂ𝕂𝔼ℝ ℝ𝔼𝕊𝕌𝕃𝕋** ── 🔮\n\n`;
    teksChat += `🏢 **DAFTAR NOMOR BISNIS (${data.bisnis.length}):**\n`;
    teksChat += data.bisnis.length > 0 ? data.bisnis.join('\n') + '\n\n' : '_(Kosong)_\n\n';

    teksChat += `👤 **DAFTAR NOMOR BIASA (${data.biasa.length}):**\n`;
    teksChat += data.biasa.length > 0 ? data.biasa.join('\n') + '\n\n' : '_(Kosong)_\n\n';
    
    teksChat += `🎛️ _Status: Selesai! Nomor mati otomatis dibuang ke laut._`;

    await bot.sendMessage(chatId, teksChat);
    delete cacheHasilScan[chatId]; 
}

async function kirimHasilSebagaiFile(chatId, messageId) {
    const data = cacheHasilScan[chatId];
    if (!data) return bot.sendMessage(chatId, "❌ Data kedaluwarsa.");

    let hasilKonten = `========================================================================================\n`;
    hasilKonten += `   🤖 JEJEST CHECKER SYSTEM ANALYSIS - METRIC LOG REPORT                               \n`;
    hasilKonten += `   ⚙️ Mode Execution : ${data.mode === 'random' ? '100 Random Samples' : 'Full Scan All File'}\n`;
    hasilKonten += `   📅 Scan Date      : ${new Date().toLocaleString('id-ID')} WIB                              \n`;
    hasilKonten += `   🛰️ Total Processed: ${data.totalProses} Nodes / ${data.totalAwal} Total File Data        \n`;
    hasilKonten += `========================================================================================\n\n`;
    
    hasilKonten += data.logDetail;

    hasilKonten += `========================================================================================\n`;
    hasilKonten += `[FINAL STATISTICS] Total Terdaftar: ${data.bisnis.length + data.biasa.length} Node | Total Mati: ${data.matiCount} (Dibuang ke laut)\n`;
    hasilKonten += `========================================================================================\n\n`;

    hasilKonten += `[📁 DAFTAR NOMOR BISNIS - TOTAL: ${data.bisnis.length}]\n`;
    hasilKonten += data.bisnis.length > 0 ? data.bisnis.join('\n') + '\n\n' : '(Kosong/Tidak ada)\n\n';

    hasilKonten += `[📁 DAFTAR NOMOR BIASA - TOTAL: ${data.biasa.length}]\n`;
    hasilKonten += data.biasa.length > 0 ? data.biasa.join('\n') + '\n\n' : '(Kosong/Tidak ada)\n\n';

    hasilKonten += `============================== END OF JEJEST REPORT ====================================\n`;

    const namaFileHasil = `Jejest_checker_${Date.now()}.txt`;
    fs.writeFileSync(namaFileHasil, hasilKonten);

    await bot.editMessageText(`✨ **[COMPUTATION COMPLETE]**\nBerkas laporan data bersih berhasil dikompilasi.`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
    }).catch(() => {});

    await bot.sendDocument(chatId, namaFileHasil, { caption: "📂 **[DATAPACK EXPEDITION]** Laporan data bersih Jejest Checker berhasil diekspor." });
    fs.unlinkSync(namaFileHasil);
    delete cacheHasilScan[chatId];
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (query.data === 'sambungkan') {
        bot.sendMessage(chatId, "📟 **[INPUT REQUIRED]**\nMasukkan nomor WhatsApp target pairing (Contoh: 08xxxx atau 628xxxx):", { reply_markup: { force_reply: true } });
    } else if (query.data === 'status') {
        const isReady = (sock && sock.user && sock.user.id);
        bot.sendMessage(chatId, `🖥️ ── **MONITORING DIAGNOSTIK** ── 🖥️\n\n🛰️ Matrix Stat: ${isReady ? "🟢 LINK ESTABLISHED (Online)" : "🔴 LINK BROKEN (Offline)"}\n⚙️ Protocol: Node-Baileys-V3`);
    }
    else if (query.data === 'scan_all' || query.data === 'scan_random') {
        bot.answerCallbackQuery(query.id).catch(() => {});
        if (!cacheFileData[chatId]) {
            return bot.sendMessage(chatId, "❌ Session file kedaluwarsa atau hilang. Silakan kirim ulang file .txt Anda.");
        }
        const dataNomor = cacheFileData[chatId];
        const mode = query.data === 'scan_all' ? 'all' : 'random';
        delete cacheFileData[chatId]; 
        jalankanBulkCekFile(chatId, messageId, dataNomor, mode);
    }
    else if (query.data === 'output_text') {
        bot.answerCallbackQuery(query.id).catch(() => {});
        kirimHasilSebagaiTeks(chatId, messageId);
    }
    else if (query.data === 'output_file') {
        bot.answerCallbackQuery(query.id).catch(() => {});
        kirimHasilSebagaiFile(chatId, messageId);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text) return;

    if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes('Masukkan nomor WhatsApp target')) {
        bot.sendMessage(chatId, "⚡ **[INITIALIZING]** Membuka port jembatan pairing baru...");
        hubungkanKeWhatsApp(msg.text, chatId, false, true); 
        return;
    }

    if (msg.text.match(/^\/cek(\s|$)/) && !msg.reply_to_message) {
        if (!sock || !sock.user) return bot.sendMessage(chatId, "❌ **[ACCESS DENIED]** Aktifkan jembatan WhatsApp terlebih dahulu lewat /start.");
        
        const inputMentah = msg.text.replace('/cek', '').trim();
        if (!inputMentah) return bot.sendMessage(chatId, "🤖 **[FORMAT COMMAND]**\n`/cek 0812xxx` atau pisahkan dengan koma/spasi/baris baru.");

        const daftarNomor = inputMentah.split(/[\s,\n]+/).map(n => n.trim()).filter(n => n.length > 5);
        const totalNomor = daftarNomor.length;

        if (totalNomor === 0) return bot.sendMessage(chatId, "❌ **[ERROR]** Format database nomor tidak valid.");

        if (totalNomor === 1) {
            bot.sendMessage(chatId, `⚡ _Memindai matriks nomor..._`, { parse_mode: 'Markdown' });
            const hasil = await prosesCekNomor(daftarNomor[0]);
            if (hasil.status === 'TERDAFTAR') {
                let textRes = `🛸 ─── **𝕎ℍ𝔸𝕋𝕊𝔸ℙ平 𝔽𝕆𝕌ℕΔ** ─── 🛸\n\n📱 **Core ID:** \`+${hasil.nomor}\`\n🤖 **Type:** *${hasil.tipe}*\n`;
                textRes += `├ **Data Bio:** _"${hasil.bio}"_\n└ **Updated Bio:** \`${hasil.waktu}\`\n\n🛠️ ─────────────────── 🛠️`;
                bot.sendMessage(chatId, textRes, { parse_mode: 'Markdown' });
            } else {
                let cleanNum = daftarNomor[0].replace(/[^0-9]/g, '');
                if (cleanNum.startsWith('08')) cleanNum = '628' + cleanNum.slice(2);
                bot.sendMessage(chatId, `💀 ── **𝙉𝙊𝙏 𝙍𝙀𝙂𝙄𝙎𝙏𝙀𝙍𝙀Δ** ── 💀\n\n📱 **Core ID:** \`+${cleanNum}\`\n❌ **Status:** Node Tidak Aktif\n\n🛠 ─────────────────── 🛠`, { parse_mode: 'Markdown' });
            }
            return;
        }

        const statusMsg = await bot.sendMessage(chatId, `⚡ **[BULK SCAN INITIALIZED]**\nMemulai komputasi massal untuk *${totalNomor}* target...`, { parse_mode: 'Markdown' });
        
        let counter = 0;
        let hasilCache = [];

        for (let item of daftarNomor) {
            if (!sock || !sock.user) {
                bot.sendMessage(chatId, "🚨 **[SCAN ABORTED]** Proses terhenti karena sender terblokir.");
                return;
            }
            counter++;
            const res = await prosesCekNomor(item);
            hasilCache.push(res);
            
            if (counter % 5 === 0 || counter === totalNomor) {
                let hasilTeks = `🔮 ── **𝕄𝕌𝕃𝕋𝕀-𝕊ℂ𝔸ナン ℝ𝔼𝕊𝕌𝕃𝕋** ── 🔮\n\n`;
                for (let data of hasilCache) {
                    if (data.status === 'TERDAFTAR') {
                        hasilTeks += `🟩 **Node:** \`+${data.nomor}\`\n├ **Kelas:** \`${data.tipe}\`\n├ **Bio:** _"${data.bio}"_\n└ **Updated:** \`${data.waktu}\`\n\n`;
                    } else {
                        hasilTeks += `🟥 **Node:** \`+${data.nomor}\`\n└ **Status:** \`DATA TIDAK AKTIF\`\n\n`;
                    }
                }
                await bot.editMessageText(hasilTeks + `🎛️ _System Processing: [ ${counter} / ${totalNomor} ]_`, {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'Markdown'
                }).catch(() => {});
            }
            await delay(400); 
        }
        return;
    }
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    if (!sock || !sock.user) return bot.sendMessage(chatId, "❌ **[ACCESS DENIED]** Sambungkan server WhatsApp terlebih dahulu.");
    
    const doc = msg.document;
    if (!doc.file_name.endsWith('.txt')) return bot.sendMessage(chatId, "❌ **[FILE FORMAT ERROR]** Hanya menerima file `.txt`!");
    
    try {
        const fileLink = await bot.getFileLink(doc.file_id);
        const response = await axios.get(fileLink);
        const daftarNomor = response.data.toString().split(/\r?\n/).map(n => n.trim()).filter(n => n.length > 5);
        const totalNomor = daftarNomor.length;
        
        if (totalNomor === 0) return bot.sendMessage(chatId, "❌ **[EMPTY]** File target kosong.");
        
        cacheFileData[chatId] = daftarNomor;
        
        let textTanya = `📂 **[DATABASE DETECTED]**\nBerhasil memuat file berisi \`${totalNomor}\` nomor target.\n\n`;
        textTanya += `🎛️ **PILIH MODALITAS PEMROSESAN:**\n`;
        textTanya += `Silakan tekan salah satu modul eksekusi di bawah ini:`;
        
        bot.sendMessage(chatId, textTanya, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: `🔥 Scan Semua (${totalNomor} Nomor)`, callback_data: "scan_all" }],
                    [{ text: "🎲 Scan 100 Sampel Acak", callback_data: "scan_random" }]
                ]
            }
        });
        
    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal memproses penguraian data file .txt.");
    }
});

bot.onText(/\/start/, (msg) => sendMenu(msg.chat.id));
bot.onText(/\/menu/, (msg) => sendMenu(msg.chat.id));

console.log("[SYSTEM] Booting Mainframe... Mencoba auto-connect sesi lama...");
hubungkanKeWhatsApp(null, null, false, false);
