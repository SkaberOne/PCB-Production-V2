import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#059669',
            light: '#10b981',
            dark: '#047857',
            contrastText: '#ffffff'
        },
        secondary: {
            main: '#a1a1aa',
            light: '#d4d4d8',
            dark: '#71717a',
            contrastText: '#ffffff'
        },
        background: {
            default: '#09090b',
            paper: '#18181b'
        },
        divider: '#27272a',
        success: {
            main: '#10b981',
            light: '#34d399'
        },
        warning: {
            main: '#f59e0b',
            light: '#fbbf24'
        },
        error: {
            main: '#ef4444',
            light: '#f87171'
        },
        text: {
            primary: '#f4f4f5',
            secondary: '#a1a1aa'
        }
    },
    typography: {
        fontFamily: '"Inter", "Segoe UI", sans-serif',
        h1: {
            fontWeight: 700,
            letterSpacing: '-0.03em',
            fontSize: '2.25rem'
        },
        h2: {
            fontWeight: 700,
            letterSpacing: '-0.03em',
            fontSize: '1.875rem'
        },
        h3: {
            fontWeight: 700,
            letterSpacing: '-0.03em',
            fontSize: '1.5rem'
        },
        h4: {
            fontWeight: 700,
            letterSpacing: '-0.02em',
            fontSize: '1.25rem'
        },
        h5: {
            fontWeight: 700,
            fontSize: '1.125rem'
        },
        h6: {
            fontWeight: 700,
            fontSize: '1rem'
        },
        body1: {
            fontSize: '1rem',
            lineHeight: 1.5
        },
        body2: {
            fontSize: '0.875rem',
            lineHeight: 1.5
        },
        button: {
            fontWeight: 600,
            textTransform: 'none'
        }
    },
    shape: {
        borderRadius: 12
    },
    components: {
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    boxShadow: 'none',
                    '&:hover': {
                        borderColor: '#3f3f46'
                    }
                }
            }
        },
        MuiButton: {
            defaultProps: {
                disableElevation: true
            },
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    paddingInline: 16,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem'
                },
                contained: {
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    '&:hover': {
                        backgroundColor: '#047857',
                        boxShadow: '0 4px 16px rgba(5, 150, 105, 0.2)'
                    }
                },
                outlined: {
                    borderColor: '#27272a',
                    color: '#f4f4f5',
                    '&:hover': {
                        borderColor: '#3f3f46',
                        backgroundColor: 'rgba(5, 150, 105, 0.05)'
                    }
                }
            }
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backgroundColor: '#18181b'
                }
            }
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#09090b',
                    borderRight: '1px solid #27272a'
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#18181b',
                    borderBottom: '1px solid #27272a',
                    color: '#f4f4f5'
                }
            }
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    color: '#a1a1aa',
                    borderRadius: 8,
                    marginBottom: 4,
                    '&:hover': {
                        backgroundColor: 'rgba(5, 150, 105, 0.1)',
                        color: '#f4f4f5'
                    },
                    '&.Mui-selected': {
                        backgroundColor: '#059669',
                        color: '#ffffff',
                        '&:hover': {
                            backgroundColor: '#047857'
                        }
                    }
                }
            }
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    backgroundColor: '#27272a',
                    color: '#f4f4f5'
                }
            }
        },
        MuiTable: {
            defaultProps: {
                size: 'small'
            },
            styleOverrides: {
                root: {
                    backgroundColor: '#18181b'
                }
            }
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderColor: '#27272a',
                    color: '#f4f4f5',
                    fontSize: '0.875rem',
                    lineHeight: 1.4,
                    padding: '8px 12px',
                    verticalAlign: 'middle'
                },
                head: {
                    backgroundColor: '#09090b',
                    fontWeight: 600,
                    color: '#a1a1aa',
                    fontSize: '0.75rem',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap'
                }
            }
        }
    }
});

/**
 */

export const colors = {
    green: '#10b981',
    greenDark: '#047857',
    blue: '#3b82f6',
    blueLight: '#7dd3fc',
    amber: '#f59e0b',
    red: '#ef4444',
    purple: '#a855f7',
    surfacePage: '#09090b',
    surfaceCard: '#18181b',
    surfaceElevated: '#27272a',
    border: '#27272a',
    borderHover: '#3f3f46',
    textPrimary: '#f4f4f5',
    textSecondary: '#a1a1aa',
    textDisabled: '#52525b',
};

export { theme };
export default theme;

