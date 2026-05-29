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
        const message = this.state.error?.message || 'Erreur inattendue';

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
