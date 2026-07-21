export const getBoldHtml = (text: string) => {
    return text.replace(/\*\w+\*/, (bold) => {
        return `<b>${bold.slice(1, bold.length-1)}</b>`
    })
}