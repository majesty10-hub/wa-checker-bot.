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
    bot.sendMessage(chatId, "🤖 ─── 𝕎𝕊 ℂℍ𝔼ℂ𝕂𝔼ℝ 𝕧𝟛.𝟠 ─── 🤖\n« 𝘾𝙤𝙧ε 𝙎𝙮𝙨𝙩εμ 𝙊𝙣λ𝙞𝙣ε »\n\n⚙️ Silakan pilih modul kendali di bawah untuk mengelola perangkat:", {
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

    const sessionDir = '/data/sesi_wa';
    if (forceNewSession) {
        if (sock) {
            try { sock.logout().catch(() => {}); sock.end(); } catch(e){}
        }
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        await delay(1000);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    // Konfigurasi paten menyamar jadi Chrome Linux biar bypass blokir IP
    sock = makeWASocket({ 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false,
        browser: ["Linux", "Chrome", "121.0.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut) {
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                if (chatId) {
                    bot.sendMessage(chatId, `🚨 **[CRITICAL ALERT - SENDER BANNED]**\nSesi mati/terblokir. Ketuk tombol di bawah untuk menyambungkan ulang:`, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "⚡ Hubungkan Sender Baru", callback_data: "sambungkan" }]] }
                    });
                }
            } else {
                if (state.creds && state.creds.me && state.creds.me.id) {
                    await delay(5000); 
                    hubungkanKeWhatsApp(null, chatId, true, false);
                }
            }
        } 
        else if (connection === 'open') {
            isConnecting = false;
            if (chatId) {
                bot.sendMessage(chatId, `🛸 **[CONNECTION ESTABLISHED]**\n\n🟢 **MAINFRAME ACTIVE 100%**`, { parse_mode: 'Markdown' });
            }
        }
    });

    if (nomorHPTumbal) {
        try {
            let nomorBersih = nomorHPTumbal.replace(/[^0-9]/g, '');
            if (nomorBersih.startsWith('08')) nomorBersih = '628' + nomorBersih.slice(2);
            
            await delay(3000);
            if (chatId) bot.sendMessage(chatId, `🛰️ **[REQUESTING PAIRING CODE]**...`, { parse_mode: 'Markdown' });
            
            const code = await sock.requestPairingCode(nomorBersih);
            const teksKode = code?.match(/.{1,4}/g)?.join('-') || code;
            if (chatId) bot.sendMessage(chatId, `🔑 ── **AUTENTIKASI ROBOTIK** ── 🔑\n\nMasukkan kode berikut ke WhatsApp Anda:\n\n👉  \`${teksKode}\`  👈`, { parse_mode: 'Markdown' });
        } catch (err) {
            isConnecting = false;
            console.error(err);
            if (chatId) bot.sendMessage(chatId, "❌ **[ERROR]** Gagal mendapatkan kode pairing. Silakan coba lagi beberapa saat lagi.");
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

            if (result.biz === true || (result.jid && result.jid.includes('biz'))) tipeAkun = "BISNIS AKUN 🏢";

            try {
                const statusData = await sock.fetchStatus(result.jid).catch(() => null);
                if (statusData && statusData.status) {
                    bio = statusData.status;
                    if (statusData.setAt) {
                        waktuBio = new Date(statusData.setAt).toLocaleDateString('id-ID') + " WIB";
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
    if (modePilihan === 'random') daftarNomor = daftarNomor.sort(() => 0.5 - Math.random()).slice(0, 100);
    const totalNomor = daftarNomor.length;
    
    await bot.editMessageText(`📥 **[PROCESSING DATASET]** Mode: \`${modePilihan.toUpperCase()}\`...`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }).catch(() => {});
    
    try {
        let listBisnis = [], listBiasa = [], tidakTerdaftarCount = 0, counter = 0;
        let logDetailTeks = ""; 

        for (let item of daftarNomor) {
            if (!sock || !sock.user) return bot.sendMessage(chatId, "🚨 Pemindaian terputus!");
            counter++;
            const res = await prosesCekNomor(item);
            if (res.status === 'TERDAFTAR') {
                logDetailTeks += `[OK] +${res.nomor} | ${res.tipe} | Bio: "${res.bio}"\n`;
                if (res.tipe.includes('BISNIS')) listBisnis.push(`+${res.nomor}`); else listBiasa.push(`+${res.nomor}`);
            } else { tidakTerdaftarCount++; }

            if (counter % 5 === 0 || counter === totalNomor) {
                await bot.editMessageText(`🤖 **[ANALYZING]**\nProgress: \`${counter}/${totalNomor}\`\n🏢 Bisnis: \`${listBisnis.length}\`\n👤 Biasa: \`${listBiasa.length}\`\n🔴 Inaktif: \`${tidakTerdaftarCount}\``, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }).catch(() => {});
            }
            await delay(400);
        }
        
        cacheHasilScan[chatId] = { totalAwal: totalNomorAwal, totalProses: totalNomor, mode: modePilihan, bisnis: listBisnis, biasa: listBiasa, matiCount: tidakTerdaftarCount, logDetail: logDetailTeks };

        await bot.editMessageText(`✨ **[SELESAI]**\n\n🏢 Bisnis: \`${listBisnis.length}\`\n👤 Biasa: \`${listBiasa.length}\``, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📄 Kirim Teks", callback_data: "output_text" }], [{ text: "📂 Ekspor File", callback_data: "output_file" }]] }
        });
    } catch(e) { bot.sendMessage(chatId, "❌ Gagal memproses data."); }
}

async function kirimHasilSebagaiTeks(chatId, messageId) {
    const data = cacheHasilScan[chatId];
    if (!data) return;
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    let teksChat = `🔮 ── **JEJEST RESULT** ── 🔮\n\n🏢 **DAFTAR BISNIS:**\n${data.bisnis.join('\n') || '(Kosong)'}\n\n👤 **DAFTAR BIASA:**\n${data.biasa.join('\n') || '(Kosong)'}`;
    await bot.sendMessage(chatId, teksChat);
    delete cacheHasilScan[chatId]; 
}

async function kirimHasilSebagaiFile(chatId, messageId) {
    const data = cacheHasilScan[chatId];
    if (!data) return;
    const namaFileHasil = `Laporan_Jejest_${Date.now()}.txt`;
    fs.writeFileSync(namaFileHasil, data.logDetail);
    await bot.editMessageText(`✨ File dikirim.`, { chat_id: chatId, message_id: messageId }).catch(() => {});
    await bot.sendDocument(chatId, namaFileHasil);
    fs.unlinkSync(namaFileHasil);
    delete cacheHasilScan[chatId];
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (query.data === 'sambungkan') {
        bot.sendMessage(chatId, "📟 Masukkan nomor WhatsApp pairing (Contoh: 26134xxxx):", { reply_markup: { force_reply: true } });
    } else if (query.data === 'status') {
        bot.sendMessage(chatId, `🖥️ Stat: ${sock?.user ? "🟢 ONLINE" : "🔴 OFFLINE"}`);
    } else if (query.data === 'output_text') {
        kirimHasilSebagaiTeks(chatId, messageId);
    } else if (query.data === 'output_file') {
        kirimHasilSebagaiFile(chatId, messageId);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text) return;

    if (msg.reply_to_message?.text?.includes('Masukkan nomor WhatsApp pairing')) {
        bot.sendMessage(chatId, "⚡ Membuka port jembatan pairing baru...");
        hubungkanKeWhatsApp(msg.text, chatId, false, true); 
        return;
    }
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    if (!sock?.user) return bot.sendMessage(chatId, "❌ Sambungkan WhatsApp dulu!");
    if (!msg.document.file_name.endsWith('.txt')) return bot.sendMessage(chatId, "❌ Wajib file .txt!");
    
    try {
        const fileLink = await bot.getFileLink(msg.document.file_id);
        const response = await axios.get(fileLink);
        const daftarNomor = response.data.toString().split(/\r?\n/).map(n => n.trim()).filter(n => n.length > 5);
        
        cacheFileData[chatId] = daftarNomor;
        bot.sendMessage(chatId, `📂 Memuat \`${daftarNomor.length}\` target. Pilih mode:`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🔥 Scan Semua", callback_data: "scan_all" }], [{ text: "🎲 Scan 100 Acak", callback_data: "scan_random" }]] }
        });
    } catch (e) { bot.sendMessage(chatId, "❌ Gagal memproses file."); }
});

bot.onText(/\/start/, (msg) => sendMenu(msg.chat.id));
bot.onText(/\/menu/, (msg) => sendMenu(msg.chat.id));

console.log("[SYSTEM] Booting...");
hubungkanKeWhatsApp(null, null, false, false);
