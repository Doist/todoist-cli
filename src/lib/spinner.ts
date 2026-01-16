import chalk from 'chalk'
import yoctoSpinner from 'yocto-spinner'

interface SpinnerOptions {
    text: string
    color?: 'green' | 'yellow' | 'blue' | 'red' | 'gray' | 'cyan' | 'magenta'
    noSpinner?: boolean // Allow overriding spinner display
}

class LoadingSpinner {
    private spinnerInstance: ReturnType<typeof yoctoSpinner> | null = null

    start(options: SpinnerOptions) {
        // Don't show spinner in non-interactive environments, when disabled via options, or when JSON output is expected
        if (!process.stdout.isTTY || options.noSpinner || this.shouldDisableSpinner()) {
            return this
        }

        const colorFn = chalk[options.color || 'blue']
        this.spinnerInstance = yoctoSpinner({
            text: colorFn(options.text),
            // yocto-spinner uses dots spinner by default which matches NPM's braille pattern
        })
        this.spinnerInstance.start()
        return this
    }

    succeed(text?: string) {
        if (this.spinnerInstance) {
            this.spinnerInstance.success(text ? chalk.green(`✓ ${text}`) : undefined)
            this.spinnerInstance = null
        }
    }

    fail(text?: string) {
        if (this.spinnerInstance) {
            this.spinnerInstance.error(text ? chalk.red(`✗ ${text}`) : undefined)
            this.spinnerInstance = null
        }
    }

    stop() {
        if (this.spinnerInstance) {
            this.spinnerInstance.stop()
            this.spinnerInstance = null
        }
    }

    private shouldDisableSpinner(): boolean {
        // Check for environment variables that should disable spinners
        if (process.env.TD_SPINNER === 'false') {
            return true
        }

        // Check if we're in CI environment
        if (process.env.CI) {
            return true
        }

        // Check process arguments for JSON output flags and --no-spinner
        const args = process.argv
        if (args.includes('--json') || args.includes('--ndjson') || args.includes('--no-spinner')) {
            return true
        }

        return false
    }
}

/**
 * High-level wrapper function for running async operations with a loading spinner.
 * Automatically handles success/failure states and cleanup.
 */
export async function withSpinner<T>(
    options: SpinnerOptions,
    asyncOperation: () => Promise<T>,
): Promise<T> {
    const loadingSpinner = new LoadingSpinner().start(options)

    try {
        const result = await asyncOperation()
        loadingSpinner.stop() // Don't show success message by default - let the command handle its own output
        return result
    } catch (error) {
        loadingSpinner.fail()
        throw error
    }
}

export { LoadingSpinner, type SpinnerOptions }
