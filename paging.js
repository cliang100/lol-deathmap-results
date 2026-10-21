export function parsePaging(query) {
    let start = parseInt(query.start, 10);
    if (!Number.isInteger(start) || start < 0) start = 0;

    let count = parseInt(query.count, 10);
    if (!Number.isInteger(count)) count = 20;
    else if (count < 1) count = 1;
    else if (count > 20) count = 20;

    return { start, count };
}