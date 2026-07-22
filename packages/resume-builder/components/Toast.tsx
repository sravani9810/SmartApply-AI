import React, { useEffect } from 'react';
import { ToastType, Toast } from '../types/ToastType';

const ToastComponent = ({ toast, removeToast}: {toast:Toast, removeToast:(id: number) => {}}) => {
    useEffect(() => {
        console.log(`received toast ${toast.message}`);
        const timeout = setTimeout(() => {
            removeToast(toast.id);
            clearTimeout(timeout);
        }, 5000);
    }, [])
    const toastTypeCss = toast.type === ToastType.SUCCESS ? ' bg-emerald-900 border-emerald-900' : ' bg-rose-900 border-rose-900';
    return (
        <div
            className={`flex-item animate-slideInFromRight w-80 ${toastTypeCss} text-white px-4 py-2 rounded shadow-lg`}

        >
            {toast.message}
        </div>
    );
};

export default ToastComponent;