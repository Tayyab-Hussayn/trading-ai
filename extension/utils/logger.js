/**
 * Logging utility for Binary Trading AI Agent
 */

import { CONFIG } from '../config.js';

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

class Logger {
    constructor() {
        this.level = LOG_LEVELS[CONFIG.LOG_LEVEL] || LOG_LEVELS.info;
        this.prefix = `[${CONFIG.APP_NAME}]`;
    }

    /**
     * Format log message with timestamp
     */
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const formatted = `${this.prefix} [${level.toUpperCase()}] ${timestamp}: ${message}`;

        if (data) {
            return [formatted, data];
        }
        return [formatted];
    }

    /**
     * Debug level logging
     */
    debug(message, data = null) {
        if (this.level <= LOG_LEVELS.debug && CONFIG.DEBUG) {
            console.log(...this.formatMessage('debug', message, data));
        }
    }

    /**
     * Info level logging
     */
    info(message, data = null) {
        if (this.level <= LOG_LEVELS.info) {
            console.log(...this.formatMessage('info', message, data));
        }
    }

    /**
     * Warning level logging
     */
    warn(message, data = null) {
        if (this.level <= LOG_LEVELS.warn) {
            console.warn(...this.formatMessage('warn', message, data));
        }
    }

    /**
     * Error level logging
     */
    error(message, error = null) {
        if (this.level <= LOG_LEVELS.error) {
            console.error(...this.formatMessage('error', message, error));

            // Log stack trace if available
            if (error && error.stack) {
                console.error(error.stack);
            }
        }
    }

    /**
     * Performance timing
     */
    time(label) {
        if (CONFIG.DEBUG) {
            console.time(`${this.prefix} ${label}`);
        }
    }

    /**
     * End performance timing
     */
    timeEnd(label) {
        if (CONFIG.DEBUG) {
            console.timeEnd(`${this.prefix} ${label}`);
        }
    }

    /**
     * Group related logs
     */
    group(label) {
        if (CONFIG.DEBUG) {
            console.group(`${this.prefix} ${label}`);
        }
    }

    /**
     * End log group
     */
    groupEnd() {
        if (CONFIG.DEBUG) {
            console.groupEnd();
        }
    }

    /**
     * Log table data
     */
    table(data) {
        if (CONFIG.DEBUG) {
            console.table(data);
        }
    }
}

// Export singleton instance
export const logger = new Logger();
export default logger;
