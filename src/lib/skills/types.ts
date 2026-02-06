export interface SkillInstaller {
    name: string
    description: string
    getInstallPath(local: boolean): string
    generateContent(): string
    isInstalled(local: boolean): Promise<boolean>
    install(local: boolean, force: boolean): Promise<void>
    update(local: boolean): Promise<void>
    uninstall(local: boolean): Promise<void>
}
