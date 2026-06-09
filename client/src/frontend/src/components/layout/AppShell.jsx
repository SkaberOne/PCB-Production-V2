import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Chip,
    Divider,
    Drawer,
    LinearProgress,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Snackbar,
    Typography
} from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { useBomSession } from '../../context/BomSessionContext';
import { computeWorkflowProgress } from '../../utils/workflowProgress';

const SIDEBAR_WIDTH = 200;
const TOPBAR_HEIGHT = 44;
const STEPPER_HEIGHT = 36;

// ─── Sidebar nav group ────────────────────────────────────────────────────────
function NavGroup({ label, pages, location }) {
    return (
        <Box sx={{ px: 1.5, mb: 0.5 }}>
            <Typography
                sx={{
                    fontSize: '0.6rem',
                    color: '#52525b',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    px: 1,
                    pb: 0.5
                }}
            >
                {label}
            </Typography>
            <List disablePadding>
                {pages.map((page) => {
                    const Icon = page.icon;
                    const selected = location.pathname === page.path;
                    return (
                        <ListItemButton
                            key={page.path}
                            component={NavLink}
                            to={page.path}
                            selected={selected}
                            sx={{
                                borderRadius: 1.5,
                                mb: 0.25,
                                px: 1.5,
                                py: 0.5,
                                minHeight: 32,
                                '&.Mui-selected': {
                                    backgroundColor: '#059669',
                                    color: '#ffffff',
                                    '& .MuiListItemIcon-root': { color: '#ffffff' }
                                },
                                '&:hover:not(.Mui-selected)': {
                                    backgroundColor: 'rgba(5, 150, 105, 0.08)',
                                    color: '#f4f4f5'
                                }
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 32, color: selected ? 'inherit' : '#71717a' }}>
                                <Icon sx={{ fontSize: 18 }} />
                            </ListItemIcon>
                            <ListItemText
                                primary={page.label}
                                primaryTypographyProps={{
                                    fontSize: '0.8125rem',
                                    fontWeight: selected ? 600 : 500
                                }}
                            />
                            {/* Numéros d'étape retirés (audit 2026-05-29 I2) — le WorkflowStrip
                                au-dessus affiche déjà la progression numérotée avec leurs cercles. */}
                        </ListItemButton>
                    );
                })}
            </List>
        </Box>
    );
}

// ─── Workflow stepper strip ───────────────────────────────────────────────────
// Les connecteurs sont des jauges : chaque segment après l'étape i reflète la
// progression réelle de cette étape (computeWorkflowProgress), pas la navigation.
function WorkflowStrip({ pages, currentPath, progress = [] }) {
    return (
        <Box
            sx={{
                height: STEPPER_HEIGHT,
                flexShrink: 0,
                backgroundColor: '#18181b',
                borderBottom: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                px: 2,
                gap: 0,
                overflowX: 'auto'
            }}
        >
            {pages.map((page, idx) => {
                const isActive = currentPath === page.path;
                const stepProgress = progress[idx] ?? 0;
                const isDone = stepProgress >= 1;

                return (
                    <React.Fragment key={page.path}>
                        <Box
                            component={NavLink}
                            to={page.path}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                px: 1.25,
                                py: 0.5,
                                borderRadius: 1,
                                textDecoration: 'none',
                                flexShrink: 0,
                                backgroundColor: isActive ? 'rgba(5, 150, 105, 0.12)' : 'transparent',
                                border: '1px solid',
                                borderColor: isActive ? 'rgba(5, 150, 105, 0.35)' : 'transparent',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                    backgroundColor: isActive
                                        ? 'rgba(5, 150, 105, 0.12)'
                                        : 'rgba(255,255,255,0.04)'
                                }
                            }}
                        >
                            {/* Step bubble */}
                            <Box
                                sx={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: '50%',
                                    backgroundColor: isActive || isDone ? '#059669' : '#27272a',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: isDone ? '0.5rem' : '0.6rem',
                                        color: '#fff',
                                        fontWeight: 700,
                                        lineHeight: 1
                                    }}
                                >
                                    {isDone ? '✓' : page.step}
                                </Typography>
                            </Box>

                            <Typography
                                sx={{
                                    fontSize: '0.75rem',
                                    fontWeight: isActive ? 600 : 500,
                                    color: isActive ? '#10b981' : isDone ? '#71717a' : '#52525b',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {page.label}
                            </Typography>
                        </Box>

                        {/* Connector gauge — fill = progression réelle de l'étape idx */}
                        {idx < pages.length - 1 && (
                            <Box
                                sx={{
                                    flex: 1,
                                    minWidth: 24,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: '#27272a',
                                    mx: 0.75,
                                    overflow: 'hidden'
                                }}
                            >
                                <Box
                                    sx={{
                                        width: `${Math.round(stepProgress * 100)}%`,
                                        height: '100%',
                                        borderRadius: 2,
                                        backgroundColor: '#059669',
                                        transition: 'width 0.4s ease'
                                    }}
                                />
                            </Box>
                        )}
                    </React.Fragment>
                );
            })}
        </Box>
    );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────
function AppShell({ pages, children }) {
    const location = useLocation();
    const { activeProduction, currentBom, bomWorkspace } = useBomSession();

    const hasBomSession =
        Boolean(currentBom) || (bomWorkspace?.selectedRevisionEntries?.length > 0);

    const currentPage = pages.find((page) => page.path === location.pathname) ?? pages[0];
    const isWorkflowPage = currentPage?.group === 'workflow';

    const workflowPages = pages.filter((p) => p.group === 'workflow');
    const libraryPages = pages.filter((p) => p.group === 'library');
    const systemPages = pages.filter((p) => p.group === 'system');

    const workflowProgress = useMemo(
        () => computeWorkflowProgress({ activeProduction, currentBom, bomWorkspace }),
        [activeProduction, currentBom, bomWorkspace]
    );


    // ── Events (loading, backend down) ──────────────────────────────────────
    const [isLoading, setIsLoading] = useState(false);
    const [backendDown, setBackendDown] = useState(false);

    useEffect(() => {
        const onStart = () => setIsLoading(true);
        const onEnd = () => setIsLoading(false);
        const onDown = () => setBackendDown(true);
        window.addEventListener('api:loading:start', onStart);
        window.addEventListener('api:loading:end', onEnd);
        window.addEventListener('api:backend:down', onDown);
        return () => {
            window.removeEventListener('api:loading:start', onStart);
            window.removeEventListener('api:loading:end', onEnd);
            window.removeEventListener('api:backend:down', onDown);
        };
    }, []);

    return (
        <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#09090b' }}>

            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <Drawer
                variant="permanent"
                sx={{
                    width: SIDEBAR_WIDTH,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: SIDEBAR_WIDTH,
                        boxSizing: 'border-box',
                        borderRight: '1px solid #27272a',
                        backgroundColor: '#09090b',
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                {/* Logo */}
                <Box
                    sx={{
                        px: 2.5,
                        py: 1.25,
                        borderBottom: '1px solid #27272a',
                        flexShrink: 0
                    }}
                >
                    <Typography
                        sx={{
                            color: '#059669',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            fontSize: '0.875rem',
                            lineHeight: 1.2
                        }}
                    >
                        PCB FLOW
                    </Typography>
                    <Typography
                        sx={{
                            color: '#a1a1aa',
                            fontSize: '0.6rem',
                            letterSpacing: '0.1em',
                            fontWeight: 600,
                            textTransform: 'uppercase'
                        }}
                    >
                        Production Suite
                    </Typography>
                </Box>

                {/* Nav */}
                <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
                    <NavGroup label="Workflow" pages={workflowPages} location={location} />

                    {libraryPages.length > 0 && (
                        <>
                            <Divider sx={{ borderColor: '#27272a', my: 1, mx: 1.5 }} />
                            <NavGroup label="Bibliothèque" pages={libraryPages} location={location} />
                        </>
                    )}

                    {systemPages.length > 0 && (
                        <>
                            <Divider sx={{ borderColor: '#27272a', my: 1, mx: 1.5 }} />
                            <NavGroup label="Système" pages={systemPages} location={location} />
                        </>
                    )}
                </Box>

                {/* Production badge */}
                <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid #27272a', flexShrink: 0 }}>
                    <Box
                        sx={{
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 2,
                            backgroundColor: activeProduction
                                ? 'rgba(5, 150, 105, 0.08)'
                                : 'rgba(255,255,255,0.02)',
                            border: '1px solid',
                            borderColor: activeProduction
                                ? 'rgba(5, 150, 105, 0.25)'
                                : '#27272a'
                        }}
                    >
                        <Typography
                            sx={{
                                fontSize: '0.6rem',
                                color: '#52525b',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                mb: 0.25
                            }}
                        >
                            Production active
                        </Typography>
                        <Typography
                            noWrap
                            sx={{
                                fontSize: '0.8rem',
                                color: activeProduction ? '#10b981' : '#3f3f46',
                                fontWeight: 600,
                                lineHeight: 1.2
                            }}
                        >
                            {activeProduction?.name || 'Aucune'}
                        </Typography>
                    </Box>
                </Box>
            </Drawer>

            {/* ── Main ───────────────────────────────────────────────────── */}
            <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

                {/* TopBar */}
                <Box
                    sx={{
                        height: TOPBAR_HEIGHT,
                        flexShrink: 0,
                        zIndex: 1200,
                        backgroundColor: '#18181b',
                        borderBottom: '1px solid #27272a',
                        display: 'flex',
                        alignItems: 'center',
                        px: 2,
                        gap: 2
                    }}
                >
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 700,
                            fontSize: '0.9375rem',
                            color: '#f4f4f5',
                            flex: 1,
                            minWidth: 0,
                            m: 0
                        }}
                        noWrap
                    >
                        {currentPage?.title || currentPage?.label}
                    </Typography>

                    {hasBomSession && (
                        <Chip
                            label="Session BOM"
                            size="small"
                            sx={{
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                color: '#10b981',
                                border: '1px solid rgba(16,185,129,0.25)',
                                fontSize: '0.7rem',
                                height: 22,
                                flexShrink: 0
                            }}
                        />
                    )}
                </Box>

                {/* Workflow stepper strip */}
                {isWorkflowPage && (
                    <WorkflowStrip
                        pages={workflowPages}
                        currentPath={location.pathname}
                        progress={workflowProgress}
                    />
                )}

                {/* Global loading bar */}
                {isLoading && (
                    <LinearProgress
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            zIndex: 1400,
                            height: 2,
                            backgroundColor: 'transparent',
                            '& .MuiLinearProgress-bar': { backgroundColor: '#059669' }
                        }}
                    />
                )}

                {/* Content */}
                <Box
                    component="main"
                    sx={{
                        flex: 1,
                        overflow: 'auto',
                        px: 2,
                        py: 2,
                    }}
                >
                    {children}
                </Box>
            </Box>

            {/* Backend unreachable snackbar */}
            <Snackbar
                open={backendDown}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                autoHideDuration={8000}
                onClose={() => setBackendDown(false)}
            >
                <Alert
                    severity="error"
                    onClose={() => setBackendDown(false)}
                    sx={{ width: '100%' }}
                >
                    Backend non disponible — vérifiez que le serveur API est lancé sur le port 8000.
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default AppShell;
