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

function sendMenu(chatId) {
    bot.sendMessage(chatId, "🤖 **WS CHECKER v4.2 (Cloud Edition)**\n\nSesi login Anda sekarang tersimpan di server cloud.", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔗 Sambungkan Sender", callback_data: "sambungkan" }],
                [{ text: "📊 Cek Status", callback_data: "status" }]
            ]
        }
    });
}

async function hubungkanKeWhatsApp(nomorHPTumbal, chatId, isRetry = false) {
    if (isConnecting && !isRetry) return;
    isConnecting = true;

    const { state, saveCreds } = await useMultiFileAuthState('sesi_wa');
    
    sock = makeWASocket({ 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode !== DisconnectReason.loggedOut) {
                await delay(8000); 
                hubungkanKeWhatsApp(nomorHPTumbal, chatId, true);
            } else {
                bot.sendMessage(chatId, "🛑 **Sender Terputus!** Sesi dihapus.");
                if (fs.existsSync('sesi_wa')) fs.rmSync('sesi_wa', { recursive: true, force: true });
            }
        } 
        else if (connection === 'open') {
            isConnecting = false;
            if (sock.user && sock.user.id) {
                bot.sendMessage(chatId, `🎉 **SENDER WHATSAPP AKTIF**`, { parse_mode: 'Markdown' });
            }
        }
    });

    setTimeout(async () => {
        if (sock && !sock.authState.creds.registered && !isRetry && nomorHPTumbal) {
            try {
                let nomorBersih = nomorHPTumbal.replace(/[^0-9]/g, '');
                if (nomorBersih.startsWith('08')) nomorBersih = '628' + nomorBersih.slice(2);
                
                const code = await sock.requestPairingCode(nomorBersih);
                const teksKode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${teksKode}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                isConnecting = false;
                bot.sendMessage(chatId, "❌ Gagal mendapatkan kode pairing.");
            }
        }
    }, 3000);
}

if (fs.existsSync('sesi_wa') && fs.readdirSync('sesi_wa').length > 0) {
    hubungkanKeWhatsApp(null, null, true);
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'sambungkan') {
        if (sock && sock.user) return bot.sendMessage(chatId, `✅ Perangkat sudah terhubung.`);
        bot.sendMessage(chatId, "Masukkan nomor WA tumbal Anda (Contoh: 08xxxxxxxxxx):", { reply_markup: { force_reply: true } });
    } else if (query.data === 'status') {
        const isReady = (sock && sock.user && sock.user.id);
        bot.sendMessage(chatId, `📊 **Status:** ${isReady ? "🟢 Aktif" : "🔴 Mati"}`);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text) return;

    if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes('Masukkan nomor WA tumbal')) {
        hubungkanKeWhatsApp(msg.text, chatId, false);
        return;
    }

    if (msg.text.startsWith('/cek') && msg.reply_to_message && msg.reply_to_message.document) {
        if (!sock || !sock.user) return bot.sendMessage(chatId, "❌ Hubungkan WA terlebih dahulu.");
        const doc = msg.reply_to_message.document;
        if (!doc.file_name.endsWith('.txt')) return bot.sendMessage(chatId, "❌ Harus file `.txt`!");
        const statusMsg = await bot.sendMessage(chatId, "📥 *Membaca file...*", { parse_mode: 'Markdown' });
        
        let hasilKonten = `===================================================================================================\n`;
        hasilKonten += `NO. HP             | STATUS      | TIPE AKUN   | TANGGAL BIO SET      | TEXT BIO\n`;
        hasilKonten += `===================================================================================================\n`;
        
        try {
            const response = await axios.get(await bot.getFileLink(doc.file_id));
            const daftarNomor = response.data.toString().split(/\r?\n/).map(n => n.trim()).filter(n => n.length > 5);
            let terdaftarCount = 0, tidakTerdaftarCount = 0, counter = 0;

            for (let item of daftarNomor) {
                if (!sock || !sock.user) throw new Error("Putus");
                counter++;
                
                let target = item.replace(/[^0-9]/g, '');
                if (target.startsWith('08')) target = '628' + target.slice(2);
                let tipeAkun = "Biasa", bio = "(Disembunyikan)", waktuBio = "-";
                
                try {
                    const [result] = await sock.onWhatsApp(target + '@s.whatsapp.net');
                    if (result && result.exists) {
                        terdaftarCount++;
                        if (result.biz === true) tipeAkun = "Bisnis";
                        try {
                            const statusData = await sock.fetchStatus(result.jid);
                            if (statusData && statusData.status) {
                                bio = statusData.status.replace(/\n/g, ' ');
                                if (statusData.setAt) waktuBio = new Date(statusData.setAt).toLocaleDateString('id-ID') + " WIB";
                            }
                        } catch(e){}
                        hasilKonten += `${`+${target}`.padEnd(18, ' ')} | [🟢 AKTIF]  | ${tipeAkun.padEnd(11, ' ')} | ${waktuBio.padEnd(20, ' ')} | "${bio}"\n`;
                    } else {
                        tidakTerdaftarCount++;
                        hasilKonten += `${`+${target}`.padEnd(18, ' ')} | [🔴 MATI]   | -           | -                    | -\n`;
                    }
                } catch(e) {
                    tidakTerdaftarCount++;
                    hasilKonten += `${`+${target}`.padEnd(18, ' ')} | [🔴 MATI]   | -           | -                    | -\n`;
                }

                if (counter % 5 === 0 || counter === daftarNomor.length) {
                    await bot.editMessageText(`⏳ **PROSES TRANSPARAN CLOUD**\n📊 Progress: \`${counter}\` / \`${daftarNomor.length}\``, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }).catch(() => {});
                }
                await delay(250);
            }

            const namaFileHasil = `Hasil_Cek_${Date.now()}.txt`;
            fs.writeFileSync(namaFileHasil, hasilKonten, 'utf8');
            await bot.editMessageText(`✨ **Selesai!**`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
            await bot.sendDocument(chatId, namaFileHasil);
            fs.unlinkSync(namaFileHasil);
        } catch(e) {
            const namaFilePartial = `Hasil_Partial_${Date.now()}.txt`;
            fs.writeFileSync(namaFilePartial, hasilKonten + "\n\n⚠️ KONEKSI TERPUTUS!", 'utf8');
            await bot.sendDocument(chatId, namaFilePartial);
            fs.unlinkSync(namaFilePartial);
        }
    }
});

bot.onText(/\/start/, (msg) => sendMenu(msg.chat.id));

