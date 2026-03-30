const { Innertube } = require('youtubei.js');
async function run() {
    const yt = await Innertube.create();
    const info = await yt.getInfo('r5bzZLEH4R4');
    let f = info.streaming_data.formats[0];
    if(!f) f = info.streaming_data.adaptive_formats[0];
    const url = f.url || (f.decipher ? f.decipher(yt.session.player) : null);
    console.log("URL:", url ? url.substring(0, 50) : 'none');
}
run();
