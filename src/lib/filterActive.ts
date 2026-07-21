/**
 * Filter out soft-deleted records from an array.
 * Records with a truthy `deletedAt` field are excluded.
 */
export function filterActive<T extends { deletedAt?: string | null }>(arr: T[]): T[] {
  return arr.filter((x) => !x.deletedAt)
}
