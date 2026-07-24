import React from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';

/**
 * React ErrorBoundary — catches unhandled JS errors in child component tree.
 *
 * Usage (wrapping a page):
 *   <ErrorBoundary context="Dashboard">
 *     <DashboardPage />
 *   </ErrorBoundary>
 *
 * The `context` prop is shown in the error message for easier debugging.
 */
/**
 * Défense en profondeur (prompt 030) : garantit qu'un message d'erreur est
 * TOUJOURS rendu comme une chaîne. Un objet/tableau (ex. `detail` Pydantic 422)
 * ne doit jamais atteindre le rendu React (sinon erreur #31 « Objects are not
 * valid as a React child »).
 */
export function toDisplayMessage(value) {
    if (value == null) return 'Erreur inattendue';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    // Erreur JS classique → son message ; sinon sérialisation lisible en repli.
    if (value instanceof Error && typeof value.message === 'string') return value.message;
    try {
        const json = JSON.stringify(value);
        return json && json !== '{}' ? json : 'Erreur inattendue';
    } catch (e) {
        return String(value);
    }
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error(
            `[ErrorBoundary] Uncaught error in "${this.props.context || 'unknown'}":`,
            error,
            info.componentStack,
        );
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { context } = this.props;
        // Toujours une chaîne (jamais un objet) — défense en profondeur (030).
        const message = toDisplayMessage(this.state.error?.message ?? this.state.error);

        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 320,
                    gap: 2,
                    p: 4,
                }}
            >
                <BugReportRoundedIcon sx={{ fontSize: 48, color: 'error.main', opacity: 0.7 }} />
                <Typography variant="h6" color="error">
                    Une erreur est survenue{context ? ` — ${context}` : ''}
                </Typography>
                <Alert severity="error" sx={{ maxWidth: 600, width: '100%' }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {message}
                    </Typography>
                </Alert>
                <Button variant="outlined" color="error" onClick={this.handleReset}>
                    Réessayer
                </Button>
            </Box>
        );
    }
}

export default ErrorBoundary;
