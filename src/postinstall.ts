import { migrateLegacyAuth } from './lib/migrate-auth.js'
import { updateAllInstalledSkills } from './lib/skills/update-installed.js'

updateAllInstalledSkills(false).catch(() => {})
migrateLegacyAuth({ silent: true }).catch(() => {})
