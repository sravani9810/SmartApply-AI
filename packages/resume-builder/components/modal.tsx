import React from 'react';

const Modal = ({ isVisible, onClose, onSubmit }) => {
    if (!isVisible) return null;

    const handleSubmit = (event) => {
        event.preventDefault();
        const apiKey = event.target.apiKey.value;
        onSubmit(apiKey);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center">
            <div className="bg-white p-4 rounded shadow-lg w-1/3">
                <h2 className="text-xl font-bold mb-4">
                    Enter PDFShift API Key 
                    <span>
                        <span className="relative group align-middle px-1">
                            <button className="rounded focus:outline-none">
                                {/* Hover or focus me */}
                                <svg width="18px" height="18px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22ZM12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75ZM12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#1C274C"/>
                                </svg>
                            </button>
                            <div className="absolute left-1/2 transform -translate-x-1/2 mt-2 w-48 p-2 bg-gray-800 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 hidden group-hover:block">
                                Create an account in PDFShift and copy the API key token and paste it
                            </div>
                        </span>
                    </span>
                </h2>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        name="apiKey"
                        placeholder="API Key"
                        className="w-full p-2 border border-gray-300 rounded mb-4"
                        required
                    />
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-500 text-white px-4 py-2 rounded mr-2"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="bg-blue-500 text-white px-4 py-2 rounded"
                        >
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Modal;
