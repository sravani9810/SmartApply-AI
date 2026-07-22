export enum ToastType {
    ERROR,
    SUCCESS,
    REMOVE
}
export interface Toast {
    type: ToastType;
    message: string;
    id: number;
}
