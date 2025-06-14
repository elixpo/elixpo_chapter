import {Jimp} from 'jimp';

async function getDominantColor(imageUrl) {
    const image = await Jimp.read(imageUrl);
    let r = 0, g = 0, b = 0, count = 0;
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {

        if ((x + y * image.bitmap.width) % 10 === 0) {
            r += this.bitmap.data[idx + 0];
            g += this.bitmap.data[idx + 1];
            b += this.bitmap.data[idx + 2];
            count++;
        }
    });
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    return `rgb(${r}, ${g}, ${b})`;
}

export { getDominantColor };