/**
 * Scaffolding a new extension.
 *
 * The templates are real files rather than strings in this module, so they can
 * be read, linted and run as what they are. They belong to the host — a CLI
 * adopting this directory brings its own — and arrive through `templatesDir`.
 */

import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CliError } from '@doist/cli-core'
import { exists } from './fs-utils.js'
import { toCommandName, toDirName, validateExtensionName } from './source.js'

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
    const entries = await readdir(templatesDir, { withFileTypes: true }).catch(() => [])
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
}

function fill(content: string, values: Record<string, string>): string {
    const filled = content.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
        key in values ? values[key] : whole,
    )

    // A placeholder nothing replaced is a typo in the template, and shipping it
    // verbatim into someone's new repository is worse than refusing.
    const leftover = filled.match(/\{\{\w+\}\}/)
    if (leftover) {
        throw new CliError(
            'EXTENSION_TEMPLATE_INVALID',
            `The template refers to ${leftover[0]}, which is not a value this command supplies.`,
        )
    }
    return filled
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
    validateExtensionName(binName, dirName)

    const name = toCommandName(binName, dirName)
    if (new Set(context.reservedNames()).has(name)) {
        throw new CliError(
            'EXTENSION_NAME_RESERVED',
            `"${name}" is the name of a built-in ${binName} command.`,
            {
                hints: [
                    `An extension called ${name} could never be run as \`${binName} ${name}\`.`,
                ],
            },
        )
    }

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

    const dir = join(options.directory ?? process.cwd(), dirName)
    if (await exists(dir)) {
        throw new CliError('EXTENSION_ALREADY_EXISTS', `${dir} already exists.`, {
            hints: ['Choose another name, or remove the directory first.'],
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
        .map((entry) => join(entry.parentPath, entry.name).slice(templateDir.length + 1))
        .sort()

    const written: string[] = []
    for (const templateFile of templateFiles) {
        // Only the last segment is renamed: a nested path such as
        // `.github/workflows/release.yml` keeps its shape.
        const segments = templateFile.split(/[\\/]/)
        const relative = [
            ...segments.slice(0, -1),
            targetName(segments.at(-1) ?? '', dirName),
        ].join('/')
        const destination = join(dir, relative)

        await mkdir(dirname(destination), { recursive: true })
        await writeFile(
            destination,
            fill(await readFile(join(templateDir, templateFile), 'utf8'), values),
        )
        // The one file that has to be runnable, since that is what td spawns.
        if (relative === dirName) await chmod(destination, 0o755)

        written.push(relative)
    }

    return { name, dirName, dir, template, files: written }
}
