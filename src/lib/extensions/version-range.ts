/**
 * A deliberately small semver range check for an extension's `requires` field.
 *
 * Supports the forms an extension author realistically writes: `>=4.1.0`,
 * `^4.1.0`, `~4.1.0`, `4.1.0`, `*`, a space-separated conjunction
 * (`>=4.1.0 <5.0.0`) and a `||` disjunction. Anything it cannot parse is
 * treated as satisfied, because a version range is advisory here: failing it
 * only prints a warning, so a false negative would be noise while a false
 * positive costs nothing.
 */

import { compareVersions, parseVersion } from '@doist/cli-core/commands'

type Comparator = { operator: string; version: string }

const COMPARATOR = /^(>=|<=|>|<|=|\^|~)?\s*v?(\d.*)$/

function parseComparator(raw: string): Comparator | undefined {
    const match = raw.trim().match(COMPARATOR)
    if (!match) return undefined
    const [, operator, version] = match
    return { operator: operator ?? '=', version }
}

/** Upper bound (exclusive) for `^` and `~`, following npm's rules. */
function upperBound(operator: string, version: string): string | undefined {
    const { major, minor, patch } = parseVersion(version)
    if (operator === '^') {
        // Caret narrows as the version approaches zero: ^1.2.3 allows minor
        // changes, ^0.2.3 allows patch changes, and ^0.0.3 allows nothing above
        // itself.
        if (major > 0) return `${major + 1}.0.0`
        if (minor > 0) return `0.${minor + 1}.0`
        return `0.0.${patch + 1}`
    }
    if (operator === '~') return `${major}.${minor + 1}.0`
    return undefined
}

function satisfiesComparator(version: string, comparator: Comparator): boolean {
    const { operator, version: target } = comparator
    const compared = compareVersions(version, target)

    switch (operator) {
        case '>':
            return compared > 0
        case '>=':
            return compared >= 0
        case '<':
            return compared < 0
        case '<=':
            return compared <= 0
        case '^':
        case '~': {
            const bound = upperBound(operator, target)
            return compared >= 0 && (bound === undefined || compareVersions(version, bound) < 0)
        }
        default:
            return compared === 0
    }
}

/**
 * True when `version` satisfies `range`, or when the range is empty or in a
 * form this checker does not understand.
 */
export function satisfiesRange(version: string, range: string | undefined): boolean {
    const trimmed = range?.trim()
    if (!trimmed || trimmed === '*' || trimmed === 'x') return true

    return trimmed.split('||').some((clause) => {
        const comparators = clause.trim().split(/\s+/).filter(Boolean).map(parseComparator)
        if (comparators.length === 0) return true
        // An unparseable comparator makes the whole clause pass; see the note
        // at the top about preferring false positives.
        return comparators.every(
            (comparator) => comparator === undefined || satisfiesComparator(version, comparator),
        )
    })
}
