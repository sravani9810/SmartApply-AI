import { Context, createContext, useReducer } from "react";
import { Toast, ToastType } from "../types/ToastType";
import { ToastContainer } from "../components/ToastContainer";
import { ToastReducer } from "../reducers/ToastReducer";

export const ToastContext: Context<any> = createContext(null);
export const ToastContextProvider = ({children}) => {
    const [state, dispatch] = useReducer(ToastReducer, []);
    const addToast = (message: string, type: ToastType) => {
        const toast: Toast = {
            type,
            id: Math.floor(Math.random()*10000),
            message
        }
        dispatch(toast);
    }
    
    const removeToast = (id: number) => {
        dispatch({
            type: ToastType.REMOVE,
            message: '',
            id: id
        })
    }
    return <>
        <ToastContext.Provider value={{addToast, removeToast, toasts: state}}>
            <div className="relative">
                {children}
                <ToastContainer />
            </div>
        </ToastContext.Provider>
    </>
}