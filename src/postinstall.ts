import { migrateLegacyAuth } from './lib/migrate-auth.js'
import { writeSkillsVersionStamp } from './lib/skills/refresh-on-upgrade.js'
import { updateAllInstalledSkills } from './lib/skills/update-installed.js'

updateAllInstalledSkills(false)
    .then(({ errors }) => (errors.length === 0 ? writeSkillsVersionStamp() : undefined))
    .catch(() => {})
migrateLegacyAuth({ silent: true }).catch(() => {})
