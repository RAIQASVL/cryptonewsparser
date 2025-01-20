export const TIMEZONE = 'Etc/GMT-3';
export const CHANNELS = [
    'iansintel',
    'unfolded_defi',
    'cointelegraph',
    'durov',
    'notcoin',
    'notpixel_channel',
    'threadingontheedge',
];

export const API_CONFIG = {
    API_ID: parseInt(process.env.API_ID || ''),
    API_HASH: process.env.API_HASH || '',
    PHONE_NUMBER: process.env.PHONE_NUMBER || '',
    CHECK_INTERVAL: parseInt(process.env.CHECK_INTERVAL || '5') * 60 * 1000,
    PORT: parseInt(process.env.PORT || '3000'),
}; 