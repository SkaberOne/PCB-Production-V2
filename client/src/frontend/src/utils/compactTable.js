export const compactTableContainerSx = {
    border: '1px solid #27272a',
    borderRadius: 2,
    overflowX: 'hidden',
    width: '100%',
    backgroundColor: '#18181b',
};

export const compactTableSx = {
    tableLayout: 'fixed',
    width: '100%',
    '& .MuiTableCell-root': {
        px: 1,
        py: 0.75,
        fontSize: '0.79rem',
        lineHeight: 1.25,
    },
    '& .MuiTableCell-head': {
        fontSize: '0.73rem',
        fontWeight: 700,
        letterSpacing: '0.01em',
    },
    '& .MuiInputBase-root': {
        fontSize: '0.79rem',
    },
    '& .MuiInputBase-input': {
        px: 1,
        py: 0.75,
    },
    '& .MuiChip-root': {
        maxWidth: '100%',
        height: 24,
    },
    '& .MuiChip-label': {
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        px: 1,
    },
};

export const compactCellSx = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

export const compactWrapCellSx = {
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.3,
};

export const compactInputSx = {
    minWidth: 0,
    '& .MuiInputBase-root': {
        fontSize: '0.79rem',
    },
    '& .MuiInputBase-input': {
        px: 1,
        py: 0.75,
    },
};

export const compactPaginationSx = {
    borderTop: '1px solid #27272a',
    color: '#d4d4d8',
    backgroundColor: '#18181b',
    '& .MuiTablePagination-toolbar': {
        minHeight: 46,
        px: 1.5,
    },
    '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
        fontSize: '0.78rem',
        mb: 0,
    },
    '& .MuiTablePagination-select, & .MuiInputBase-root': {
        fontSize: '0.78rem',
        color: '#f4f4f5',
    },
    '& .MuiTablePagination-actions button': {
        color: '#f4f4f5',
    },
};
