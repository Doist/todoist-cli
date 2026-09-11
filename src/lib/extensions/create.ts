/**
 * Scaffolding a new extension.
 *
 * The templates are real files rather than strings in this module, so they can
 * be read, linted and run as what they are. They belong to the host — a CLI
 * adopting this directory brings its own — and arrive through `templatesDir`.
 */

import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { CliError } from '@doist/cli-core'
import { requireUsableName, toCommandName, toDirName } from './source.js'

export type CreateOptions = {
    /** Template to scaffold from. Defaults to the first one available. */
    template?: string
    /** Where to create the directory. Defaults to the working directory. */
    directory?: string
    description?: string
}

export type CreateResult = {
    name: string
    dirName: string
    dir: string
    template: string
    /** Paths written, relative to the new directory. */
    files: string[]
}

export type CreateContext = {
    binName: string
    /** Host version, for the `requires` range the manifest starts with. */
    version: string
    /** Directory holding one subdirectory per template. */
    templatesDir: string
    reservedNames: () => Iterable<string>
}

/**
 * Two names cannot be taken literally from the template directory.
 *
 * The executable is named after the extension, which is only known here. And
 * npm rewrites a `.gitignore` inside a published package, so it is carried
 * under a name npm leaves alone and restored on the way out.
 */
function targetName(templateFile: string, dirName: string): string {
    if (templateFile === 'executable') return dirName
    if (templateFile === 'gitignore') return '.gitignore'
    return templateFile
}

export async function listTemplates(templatesDir: string): Promise<string[]> {
    // Errors are not swallowed: a host that points this somewhere unreadable
    // should hear why, rather than being told there are no templates.
    const entries = await readdir(templatesDir, { withFileTypes: true })
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g

/**
 * Fill a template, checking it before substituting rather than after.
 *
 * The difference matters because one of the values is the description the user
 * typed. Checking the result would let `--description 'uses {{NAME}}'` fail as
 * though the template were broken, and the message would blame the wrong
 * thing entirely.
 */
function fill(templateFile: string, content: string, values: Record<string, string>): string {
    for (const [whole, key] of content.matchAll(PLACEHOLDER)) {
        if (!(key in values)) {
            throw new CliError(
                'EXTENSION_TEMPLATE_INVALID',
                `The template file ${templateFile} refers to ${whole}, which is not a value this command supplies.`,
            )
        }
    }

    // Escaped for where it is going: a description holding a quote, a
    // backslash or a newline would otherwise make the manifest invalid JSON,
    // and an unreadable manifest is silently ignored rather than reported.
    const escape = templateFile.endsWith('.json')
        ? (value: string) => JSON.stringify(value).slice(1, -1)
        : (value: string) => value

    return content.replace(PLACEHOLDER, (_whole, key: string) => escape(values[key]))
}

export async function createExtension(
    rawName: string,
    options: CreateOptions,
    context: CreateContext,
): Promise<CreateResult> {
    const { binName } = context

    // Accept `goals` or `td-goals`, and hold both to the rules install uses, so
    // a name that could never be installed is never scaffolded either.
    const dirName = toDirName(binName, toCommandName(binName, rawName))
    const name = requireUsableName(
        binName,
        dirName,
        context.reservedNames,
        (taken) => `An extension called ${taken} could never be run as \`${binName} ${taken}\`.`,
    )

    const available = await listTemplates(context.templatesDir)
    if (available.length === 0) {
        throw new CliError(
            'EXTENSION_TEMPLATE_INVALID',
            `No templates found in ${context.templatesDir}.`,
        )
    }

    const template = options.template ?? available[0]
    if (!available.includes(template)) {
        throw new CliError('EXTENSION_TEMPLATE_INVALID', `There is no "${template}" template.`, {
            hints: [`Available templates: ${available.join(', ')}.`],
        })
    }

    const values = {
        NAME: name,
        DIRNAME: dirName,
        BIN: binName,
        VERSION: context.version,
        DESCRIPTION: options.description ?? `A ${binName} extension`,
        OWNER: '<owner>',
    }

    const templateDir = join(context.templatesDir, template)
    const templateFiles = (await readdir(templateDir, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => relative(templateDir, join(entry.parentPath, entry.name)))
        .sort()

    // Everything is read and filled before anything is written, so a template
    // this command cannot render leaves no half-made directory behind for the
    // user to clear up before trying again.
    const rendered = await Promise.all(
        templateFiles.map(async (templateFile) => {
            // Only the last segment is renamed: a nested path such as
            // `.github/workflows/release.yml` keeps its shape.
            const segments = templateFile.split(/[\\/]/)
            const path = [
                ...segments.slice(0, -1),
                targetName(segments.at(-1) ?? '', dirName),
            ].join('/')
            const content = await readFile(join(templateDir, templateFile), 'utf8')
            return { path, content: fill(path, content, values) }
        }),
    )

    const dir = join(options.directory ?? process.cwd(), dirName)

    // The directory is claimed by creating it, not by asking whether it is
    // there and creating it afterwards. In a shared directory those are not
    // the same: between the question and the answer, someone else can put a
    // symlink where this is about to write.
    try {
        await mkdir(dir)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new CliError('EXTENSION_ALREADY_EXISTS', `${dir} already exists.`, {
                hints: ['Choose another name, or remove the directory first.'],
            })
        }
        throw error
    }

    for (const { path, content } of rendered) {
        const destination = join(dir, path)
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, content)
        // The one file that has to be runnable, since that is what td spawns.
        if (path === dirName) await chmod(destination, 0o755)
    }

    return { name, dirName, dir, template, files: rendered.map(({ path }) => path) }
}
