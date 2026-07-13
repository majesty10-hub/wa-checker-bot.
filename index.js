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
        connectTimeoutMs: 120000, 
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false,
        browser: ['Mac OS', 'Safari', '10.15.7'] 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut) {
                if (fs.existsSync('/data/sesi_wa')) {
                    fs.rmSync('/data/sesi_wa', { recursive: true, force: true });
                }
                if (chatId) {
                    bot.sendMessage(chatId, `🚨 **[CRITICAL ALERT]** Akun WhatsApp Anda terblokir atau sesi berakhir. Silakan hubungkan sender baru.`, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "⚡ Hubungkan Sender Baru", callback_data: "sambungkan" }]] }
                    });
                }
            } 
            else {
                if (state.creds && state.creds.me && state.creds.me.id) {
                    await delay(5000); 
                    hubungkanKeWhatsApp(null, chatId, true, false);
                }
            }
        } 
        else if (connection === 'open') {
            isConnecting = false;
            if (chatId) {
                bot.sendMessage(chatId, `🛸 **[CONNECTION ESTABLISHED]**\n🟢 **MAINFRAME ACTIVE 100%**`, { parse_mode: 'Markdown' });
            }
        }
    });

    if (nomorHPTumbal) {
        try {
            let nomorBersih = nomorHPTumbal.replace(/[^0-9]/g, '');
            if (nomorBersih.startsWith('08')) nomorBersih = '628' + nomorBersih.slice(2);
            await delay(2500);
            
            if (chatId) bot.sendMessage(chatId, `🛰️ **[REQUESTING PAIRING CODE]**...`, { parse_mode: 'Markdown' });
            
            const code = await sock.requestPairingCode(nomorBersih);
            const teksKode = code?.match(/.{1,4}/g)?.join('-') || code;
            if (chatId) bot.sendMessage(chatId, `🔑 ── **AUTENTIKASI ROBOTIK** ── 🔑\n\n👉  \`${teksKode}\`  👈`, { parse_mode: 'Markdown' });
        } catch (err) {
            isConnecting = false;
            if (chatId) bot.sendMessage(chatId, "❌ **[ERROR]** Gagal mendapatkan kode. Coba lagi.");
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

            try {
                const profilBisnis = await sock.getBusinessProfile(result.jid).catch(() => null);
                if (profilBisnis) tipeAkun = "BISNIS AKUN 🏢";
            } catch (err) {}

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
    
    await bot.editMessageText(`📥 **[ANALYZING DATASET]**...`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }).catch(() => {});
    
    try {
        let listBisnis = [], listBiasa = [], terdaftarCount = 0, tidakTerdaftarCount = 0, counter = 0;
        let logDetailTeks = ""; 

        for (let item of daftarNomor) {
            if (!sock || !sock.user) return;
            counter++;
            const res = await prosesCekNomor(item);
            if (res.status === 'TERDAFTAR') {
                terdaftarCount++;
                logDetailTeks += `[OK] +${res.nomor} | ${res.tipe} | ${res.bio}\n`;
                if (res.tipe.includes('BISNIS')) listBisnis.push(`+${res.nomor}`); else listBiasa.push(`+${res.nomor}`);
            } else { tidakTerdaftarCount++; }

            if (counter % 5 === 0 || counter === totalNomor) {
                await bot.editMessageText(`🤖 **[ANALYZING]**\nProgress: \`${counter}/${totalNomor}\`\n🏢 Bisnis: \`${listBisnis.length}\`\n👤 Biasa: \`${listBiasa.length}\``, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }).catch(() => {});
            }
            await delay(400);
        }
        cacheHasilScan[chatId] = { totalAwal: totalNomorAwal, totalProses: totalNomor, mode: modePilihan, bisnis: listBisnis, biasa: listBiasa, matiCount: tidakTerdaftarCount, logDetail: logDetailTeks };
        bot.editMessageText(`✨ **[COMPLETED]**\nData bersih berhasil dikompilasi.`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📄 Kirim Teks", callback_data: "output_text" }], [{ text: "📂 Ekspor File", callback_data: "output_file" }]] } });
    } catch(e) { bot.sendMessage(chatId, "❌ Error."); }
}

async function kirimHasilSebagaiTeks(chatId, messageId) {
    const data = cacheHasilScan[chatId];
    if (!data) return;
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    let teksChat = `🔮 **RESULT**\n🏢 Bisnis (${data.bisnis.length}):\n${data.bisnis.join('\n')}\n\n👤 Biasa (${data.biasa.length}):\n${data.biasa.join('\n')}`;
    await bot.sendMessage(chatId, teksChat);
    delete cacheHasilScan[chatId]; 
}

async function kirimHasilSebagaiFile(chatId, messageId) {
    const data = cacheHasilScan[chatId];
    if (!data) return;
    const namaFile = `Jejest_${Date.now()}.txt`;
    fs.writeFileSync(namaFile, data.logDetail);
    await bot.sendDocument(chatId, namaFile);
    fs.unlinkSync(namaFile);
    delete cacheHasilScan[chatId];
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    if (query.data === 'sambungkan') bot.sendMessage(chatId, "Masukkan nomor WhatsApp (Contoh: 628xxxx):", { reply_markup: { force_reply: true } });
    else if (query.data === 'status') bot.sendMessage(chatId, `🛰️ Matrix Stat: ${sock?.user ? "🟢 ONLINE" : "🔴 OFFLINE"}`);
    else if (query.data.startsWith('scan')) jalankanBulkCekFile(chatId, messageId, cacheFileData[chatId], query.data === 'scan_all' ? 'all' : 'random');
    else if (query.data === 'output_text') kirimHasilSebagaiTeks(chatId, messageId);
    else if (query.data === 'output_file') kirimHasilSebagaiFile(chatId, messageId);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.reply_to_message?.text?.includes('Masukkan nomor WhatsApp')) hubungkanKeWhatsApp(msg.text, chatId, false, true);
    if (msg.text?.startsWith('/cek')) {
        const daftar = msg.text.replace('/cek', '').trim().split(/[\s,\n]+/);
        if (daftar.length === 1) {
            const hasil = await prosesCekNomor(daftar[0]);
            bot.sendMessage(chatId, hasil.status === 'TERDAFTAR' ? `🟩 **+${hasil.nomor}** (${hasil.tipe})` : `🟥 **+${hasil.nomor}** (Tidak Aktif)`);
        }
    }
});

bot.on('document', async (msg) => {
    const fileLink = await bot.getFileLink(msg.document.file_id);
    const response = await axios.get(fileLink);
    cacheFileData[msg.chat.id] = response.data.toString().split(/\r?\n/).filter(n => n.length > 5);
    bot.sendMessage(msg.chat.id, "File dimuat. Pilih mode:", { reply_markup: { inline_keyboard: [[{ text: "Scan Semua", callback_data: "scan_all" }], [{ text: "Scan Random", callback_data: "scan_random" }]] } });
});

bot.onText(/\/start/, (msg) => sendMenu(msg.chat.id));
hubungkanKeWhatsApp(null, null, false, false);
