import { describe, expect, it } from 'vitest'
import {
    authoredManifestFileName,
    manifestFileName,
    normalizeSelector,
    parseRepoRef,
    parseSource,
    toCommandName,
    toDirName,
    validateExtensionName,
} from './source.js'

describe('naming', () => {
    it('derives directory and command names from the host binary name', () => {
        expect(toDirName('td', 'goals')).toBe('td-goals')
        expect(toDirName('td', 'td-goals')).toBe('td-goals')
        expect(toCommandName('td', 'td-goals')).toBe('goals')
        expect(toCommandName('tdc', 'tdc-standup')).toBe('standup')
    })

    it('derives both manifest filenames from the host binary name', () => {
        expect(authoredManifestFileName('td')).toBe('td-extension.json')
        expect(manifestFileName('td')).toBe('.td-manifest.json')
        expect(manifestFileName('tdc')).toBe('.tdc-manifest.json')
    })

    it('accepts a bare name, a prefixed name or an owner-qualified name', () => {
        expect(normalizeSelector('td', 'goals')).toBe('goals')
        expect(normalizeSelector('td', 'td-goals')).toBe('goals')
        expect(normalizeSelector('td', 'Doist/td-goals')).toBe('goals')
    })

    it.each(['td-goals', 'td-weekly-review', 'td-g2'])('accepts %s', (name) => {
        expect(() => validateExtensionName('td', name)).not.toThrow()
    })

    it.each(['goals', 'td-', 'td-Goals', 'td--x', 'tdgoals'])('rejects %s', (name) => {
        expect(() => validateExtensionName('td', name)).toThrow(/not a valid extension name/)
    })
})

describe('parseRepoRef', () => {
    it.each([
        ['https://github.com/Doist/td-goals.git', 'github.com', 'Doist', 'td-goals'],
        ['https://git.example.com/Doist/td-goals', 'git.example.com', 'Doist', 'td-goals'],
        ['git@github.com:example/td-standup.git', 'github.com', 'example', 'td-standup'],
    ])('parses %s', (url, host, owner, repo) => {
        expect(parseRepoRef(url)).toEqual({ host, owner, repo })
    })

    it('returns undefined for something that is not a remote', () => {
        expect(parseRepoRef('not-a-remote')).toBeUndefined()
    })
})

describe('parseSource', () => {
    it('treats owner/repo as GitHub', () => {
        expect(parseSource('Doist/td-goals')).toEqual({
            type: 'git',
            host: 'github.com',
            owner: 'Doist',
            repo: 'td-goals',
            url: 'https://github.com/Doist/td-goals.git',
            isGitHub: true,
        })
    })

    it('parses a full GitHub URL and strips the .git suffix', () => {
        // The whole object, because `url` is what install clones from.
        expect(parseSource('https://github.com/example/td-standup.git')).toEqual({
            type: 'git',
            host: 'github.com',
            owner: 'example',
            repo: 'td-standup',
            url: 'https://github.com/example/td-standup.git',
            isGitHub: true,
        })
    })

    it('marks a non-GitHub host so the API is never used for it', () => {
        expect(parseSource('https://git.example.com/Doist/td-x')).toEqual({
            type: 'git',
            host: 'git.example.com',
            owner: 'Doist',
            repo: 'td-x',
            url: 'https://git.example.com/Doist/td-x',
            isGitHub: false,
        })
    })

    it('parses scp-style git remotes', () => {
        expect(parseSource('git@github.com:Doist/td-goals.git')).toEqual({
            type: 'git',
            host: 'github.com',
            owner: 'Doist',
            repo: 'td-goals',
            url: 'git@github.com:Doist/td-goals.git',
            isGitHub: true,
        })
    })

    it('recognises the host however it was capitalised', () => {
        expect(parseSource('git@GitHub.com:Doist/td-goals.git')).toMatchObject({
            host: 'github.com',
            isGitHub: true,
        })
        expect(parseRepoRef('https://GITHUB.com/Doist/td-goals')?.host).toBe('github.com')
    })

    it.each([
        '.',
        './td-scratch',
        '../td-scratch',
        '/tmp/td-scratch',
        '~/code/td-scratch',
        '.\\td-scratch',
        '..\\td-scratch',
        'C:\\code\\td-scratch',
    ])('treats %s as a local path', (source) => {
        expect(parseSource(source)).toEqual({ type: 'local', path: source })
    })

    it('refuses input that names neither a repository nor a path', () => {
        expect(() => parseSource('not a source')).toThrow(/Cannot work out/)
    })
})
