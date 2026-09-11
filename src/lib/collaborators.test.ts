import { describe, expect, it } from 'vitest'

import { formatUserShortName } from './collaborators.js'

describe('formatUserShortName', () => {
    it.each([
        ['Name | 🌴', 'Name'],
        ['name (OOO Friday)', 'name'],
        ['Firstname Surname (OOO Sept 4-7)', 'Firstname S.'],
        ['Firstname Surname (OOO until Tuesday, Sept 8)', 'Firstname S.'],
        ['Firstname Surname (working half days sept 1-4)', 'Firstname S.'],
        ['Firstname Surname - OOO back Tue', 'Firstname S.'],
        ['Firstname OOO - Back on September 8', 'Firstname'],
        ['Firstname Surname (Back 7 Sept)', 'Firstname S.'],
        ['Firstname 🏖️ (🔙 31 Aug)', 'Firstname'],
        ['Firstname Surname', 'Firstname S.'],
        // Different initials ensure that a status month cannot pass as a surname.
        ['Ada Lovelace (Back 7 Sept)', 'Ada L.'],
        ['Ada Lovelace – away', 'Ada L.'],
        ['Ada Lovelace — away', 'Ada L.'],
        ['Ada Lovelace | away', 'Ada L.'],
        ['Ada ooo', 'Ada'],
        ['Ada Lovelace OOO', 'Ada L.'],
        ['Ada (nickname) (OOO Friday)', 'Ada'],
    ])('omits status text in %j, returning %j', (input, expected) => {
        expect(formatUserShortName(input)).toBe(expected)
    })

    it.each([
        ['', ''],
        ['   ', ''],
        ['Rui', 'Rui'],
        ['Ada Lovelace', 'Ada L.'],
        ['Steven Kao Smith', 'Steven K.'],
        ['Anne-Marie Smith-Jones', 'Anne-Marie S.'],
        ['Ada O’Connor', 'Ada O.'],
        ['Ada Ooolander', 'Ada O.'],
        ['  Ada \t Lovelace  ', 'Ada L.'],
        ['José García', 'José G.'],
        ['李 小明', '李 小.'],
        ['محمد علي', 'محمد ع.'],
        ['Ada E\u0301clair', 'Ada E\u0301.'],
        ['Ada 𐐀name', 'Ada 𐐀.'],
        ['Yuki 🎌 Tanaka', 'Yuki'],
        ['Omar | 🌴', 'Omar'],
        ['A 👨‍👩‍👧', 'A'],
        ['Ada 123', 'Ada'],
    ])('abbreviates %j to %j without splitting graphemes', (input, expected) => {
        const result = formatUserShortName(input)
        expect(result).toBe(expected)
        expect(result.isWellFormed()).toBe(true)
    })
})
