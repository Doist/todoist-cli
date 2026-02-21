const passthrough = (text: string) => text

function createChalkProxy(): typeof passthrough {
    return new Proxy(passthrough, {
        get: () => createChalkProxy(),
    }) as typeof passthrough
}

export default createChalkProxy()
