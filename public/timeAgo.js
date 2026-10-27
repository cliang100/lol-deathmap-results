export function timeAgo(timestampMs, nowMs) {
    const seconds = Math.floor((nowMs - timestampMs) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${Math.max(1, hours)} hr ago`;
    const days = Math.floor(hours / 24);
    return `${Math.max(1, days)} days ago`;
}