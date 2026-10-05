import { migrateLegacyAuth } from './lib/migrate-auth.js'
import { refreshInstalledSkills } from './lib/skills/refresh-on-upgrade.js'

refreshInstalledSkills().catch(() => {})
migrateLegacyAuth({ silent: true }).catch(() => {})
