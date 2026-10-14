export function gameToCanvas(x, y, canvasSize = 512) {
    const minX = -120, maxX = 14870;
    const minY = -120, maxY = 14980;

    const canvasX = ((x - minX) / (maxX - minX)) * canvasSize;
    const canvasY = canvasSize - ((y - minY) / (maxY - minY)) * canvasSize;

    return { canvasX, canvasY };
}

export function intensityToColor(alpha) {
    const stops = [
        [0, [0, 0, 255]],
        [85, [0, 255, 0]],
        [170, [255, 255, 0]],
        [255, [255, 0, 0]],
    ];

    for (let i = 0; i < stops.length - 1; i ++) {
        const [t1, c1] = stops[i];
        const [t2, c2] = stops[i + 1];

        if (alpha >= t1 && alpha <= t2) {
            const ratio = (alpha - t1) / (t2 - t1);
            return [
                Math.round(c1[0] + (c2[0] - c1[0]) * ratio),
                Math.round(c1[1] + (c2[1] - c1[1]) * ratio),
                Math.round(c1[2] + (c2[2] - c1[2]) * ratio),
            ];
        }
    }
    return stops[stops.length - 1][1];
}

if (typeof module !== 'undefined') {
    module.exports = { gameToCanvas, intensityToColor };
}