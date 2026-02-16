const express = require('express');
const admin = require('firebase-admin');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require('pino');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// --- Firebase Admin Setup ---
// আপনার Firebase Project ID: fynora-81313
const serviceAccount = {
  "projectId": "fynora-81313",
  // নোট: রেন্ডার এ চালানোর জন্য আপনাকে Firebase Console > Project Settings > Service Accounts থেকে একটি JSON কি জেনারেট করে নিতে হবে।
  // আপাতত আমরা ডাটাবেস URL দিয়ে কাজ চালানোর চেষ্টা করব।
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://fynora-81313-default-rtdb.firebaseio.com"
});

const db = admin.database();

// হোয়াটসঅ্যাপ পেয়ারিং কোড জেনারেটর
app.get('/api/get-code', async (req, res) => {
    const phone = req.query.number;
    const userPhone = req.query.userPhone; // লগইন করা ইউজারের আইডি

    try {
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" })
        });

        if (!sock.authState.creds.registered) {
            await delay(3000);
            const code = await sock.requestPairingCode(phone);
            res.json({ code });
        } else {
            res.json({ error: "ইতিমধ্যে লগইন করা আছে" });
        }

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
                // ফায়ারবেসে স্ট্যাটাস আপডেট করা
                await db.ref('users/' + userPhone).update({
                    status: "online",
                    lastConnected: new Date().getTime()
                });
                console.log(`Connected: ${phone}`);
            }
        });
    } catch (e) {
        res.status(500).json({ error: "সার্ভার এরর" });
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Server Running..."));
