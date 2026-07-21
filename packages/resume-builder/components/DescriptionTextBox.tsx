import { useCallback, useMemo } from "react"

const DescriptionTextBox= ({descItems, type, index, handleDescriptionChange}: {
    descItems: string[],
    type: string,
    index: number,
    handleDescriptionChange: (type: string, index: number, descItems: string[]) => void }): JSX.Element  => {
    const descEditable = useMemo(() => {
        return descItems.join("\n");
    }, [descItems]);
    const onDescChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const currDesc = e.target.value;
        if (currDesc) {
            handleDescriptionChange(type, index, currDesc.split("\n"))
        }
    }, [handleDescriptionChange]);
    return <>
        <textarea
                value={descEditable}
                onChange={onDescChange}
                className="w-full h-16 bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
        />
    </>
};

export default DescriptionTextBox;