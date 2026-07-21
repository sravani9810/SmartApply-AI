import {Toast, ToastType} from "../types/ToastType"

/**
 * 
 * @param state list of toasts
 * @param action object with type, message, id
 * @returns new state
 */
export const ToastReducer = (state: Toast[], action: Toast) => {
    switch(action.type) {
        case ToastType.ERROR:
        case ToastType.SUCCESS:
            return [...state, {...action}];
        case ToastType.REMOVE:
            return state.filter(toast => toast.id !== action.id);
        default:
            return [...state];
    }
}