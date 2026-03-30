const axios = require('axios');

async function checkPiped() {
    const instances = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.syncpundit.io',
        'https://pipedapi.lunar.icu',
        'https://piped-api.garudalinux.org',
        'https://pipedapi.tokhmi.xyz',
        'https://pi.ggtyler.dev'
    ];
    for(const inst of instances) {
        try {
            const res = await axios.get(`${inst}/streams/lyH7bbtBpIA`, {timeout: 3000});
            console.log("SUCCESS piped:", inst, res.data.videoStreams?.length);
        } catch (e) {
            console.log("FAIL piped:", inst, e.response?.status || e.message);
        }
    }
}
async function checkInvidious() {
    const instances = [
        'https://invidious.no-logs.com',
        'https://yt.artemislena.eu',
        'https://iv.ggtyler.dev',
        'https://invidious.privacydev.net'
    ];
    for(const inst of instances) {
        try {
            const res = await axios.get(`${inst}/api/v1/videos/lyH7bbtBpIA`, {timeout: 3000});
            console.log("SUCCESS invidious:", inst, res.data.formatStreams?.length);
        } catch (e) {
            console.log("FAIL invidious:", inst, e.response?.status || e.message);
        }
    }
}
async function run() { await checkPiped(); await checkInvidious(); }
run();
