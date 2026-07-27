export type SkillInstaller = {
    name: string
    description: string
    getInstallPath(local: boolean): string
    /** Path a previous CLI version installed to, or undefined when the agent never had one. */
    getLegacyInstallPath(local: boolean): string | undefined
    hasLegacyInstall(local: boolean): Promise<boolean>
    generateContent(): string
    isInstalled(local: boolean): Promise<boolean>
    install(local: boolean, force: boolean): Promise<void>
    update(local: boolean): Promise<void>
    uninstall(local: boolean): Promise<void>
}
