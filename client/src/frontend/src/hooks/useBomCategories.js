import React from 'react';
import apiClient from '../api/client';
import { extractRequestError } from '../utils/machinePnp';

/**
 * Loads and exposes BOM categories from /bom/categories.
 * Auto-fetches on mount. Sorted alphabetically (fr locale).
 */
export function useBomCategories() {
    const [bomCategories, setBomCategories] = React.useState([]);
    const [bomCategoriesLoading, setBomCategoriesLoading] = React.useState(false);
    const [bomCategoriesError, setBomCategoriesError] = React.useState('');

    const loadBomCategories = React.useCallback(async () => {
        setBomCategoriesLoading(true);
        setBomCategoriesError('');
        try {
            const response = await apiClient.get('/bom/categories');
            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            setBomCategories(
                items
                    .filter((item) => String(item?.name || '').trim())
                    .sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' })),
            );
            return true;
        } catch (requestError) {
            setBomCategories([]);
            setBomCategoriesError(extractRequestError(requestError, 'Impossible de charger les categories disponibles.'));
            return false;
        } finally {
            setBomCategoriesLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadBomCategories();
    }, [loadBomCategories]);

    return { bomCategories, bomCategoriesLoading, bomCategoriesError, loadBomCategories };
}
