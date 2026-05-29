import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { BomSessionProvider } from './context/BomSessionContext';
import theme from './theme';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <BomSessionProvider>
                <HashRouter>
                    <App />
                </HashRouter>
            </BomSessionProvider>
        </ThemeProvider>
    </React.StrictMode>
);
