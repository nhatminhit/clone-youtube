const axios = require('axios');
async function run() {
    try {
        const res = await axios.post('https://api.cobalt.tools/api/json', {
            url: 'https://www.youtube.com/watch?v=r5bzZLEH4R4',
            videoQuality: 'max',
            filenamePattern: 'nerd'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log("COBALT SUCCESS:", res.data);
    } catch(e) {
        console.log("COBALT ERROR:", e.message, e.response?.status, e.response?.data);
    }
}
run();
