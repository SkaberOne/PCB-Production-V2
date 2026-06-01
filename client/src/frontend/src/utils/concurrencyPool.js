/**
 * Exécute un tableau de fonctions async avec une limite de concurrence.
 *
 * Utile pour batch-uploader N fichiers en parallèle sans submerger
 * le backend (ex: 50 BOM, mais max 4 uploads simultanés).
 *
 * @template T
 * @param {Array<() => Promise<T>>} taskFactories  Fonctions à appeler (pas des Promises déjà lancées).
 * @param {number} limit                           Nombre max de tâches simultanées.
 * @returns {Promise<T[]>}                         Résultats dans le même ordre que taskFactories.
 *
 * Si une factory throw de façon inattendue, le worker continue avec les suivantes
 * et inscrit `{ success: false, _workerError: true, error }` à l'index correspondant.
 * Cela garantit que le pool ne bloque jamais sur une erreur imprévue.
 */
export async function runWithConcurrencyLimit(taskFactories, limit) {
    const results = new Array(taskFactories.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < taskFactories.length) {
            const index = nextIndex;
            nextIndex += 1;
            try {
                // eslint-disable-next-line no-await-in-loop
                results[index] = await taskFactories[index]();
            } catch (err) {
                // La factory a throwé de façon inattendue — on stocke l'erreur et on continue.
                // Les factories sont censées retourner des résultats d'erreur plutôt que de throw,
                // mais ce guard rend le pool robuste quoi qu'il arrive.
                results[index] = { success: false, _workerError: true, error: err };
                // eslint-disable-next-line no-console
                console.warn('[runWithConcurrencyLimit] Factory inattendue throw:', err);
            }
        }
    }

    const workers = Array.from({ length: Math.min(limit, taskFactories.length) }, worker);
    await Promise.all(workers);
    return results;
}
