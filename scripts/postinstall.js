#!/usr/bin/env node

/**
 * Postinstall script that updates installed skills after package installation.
 * Silently succeeds when dist/ hasn't been built yet (e.g., during local development).
 */

import('../dist/postinstall.js').catch((err) => {
    if (err.code !== 'ERR_MODULE_NOT_FOUND') {
        console.error(err)
    }
})
