import {handleError} from './logging';

/**
 * Process items in batches with progress reporting
 * @param items Array of items to process
 * @param batchSize Number of items to process in each batch
 * @param processFn Function to process each item
 * @param onProgress Optional callback for progress reporting
 * @returns Array of results from processing each item
 */
export async function processBatch<T, R>(
    items: T[],
    batchSize: number,
    processFn: (item: T) => Promise<R>,
    onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(async (item) => {
                try {
                    return await processFn(item);
                } catch (error) {
                    handleError(error, `Batch process error for item: ${JSON.stringify(item)}`);
                    throw error;
                }
            })
        );

        results.push(...batchResults);

        if (onProgress) {
            onProgress(Math.min(i + batchSize, items.length), items.length);
        }
    }

    return results;
}