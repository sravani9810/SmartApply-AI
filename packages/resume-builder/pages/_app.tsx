import { ToastContextProvider } from '../contexts/ToastContext'
import '../styles/globals.css'
import type { AppProps } from 'next/app'

function MyApp({ Component, pageProps }: AppProps) {
  return <>
      <ToastContextProvider>
        <Component {...pageProps} />
      </ToastContextProvider>
    </>
  return 
}

export default MyApp
