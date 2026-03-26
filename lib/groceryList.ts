export interface GroceryListItem {
  id: string;
  itemId: string | null;   // Supabase item ID, null for sample/custom items
  name: string;
  category: string;
  checked: boolean;
  addedAt: string;         // ISO timestamp
  checkedAt: string | null;
}

const STORAGE_KEY = 'shelfcheck_grocery_lists';

function loadAll(): Record<string, GroceryListItem[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GroceryListItem[]>) : {};
  } catch {
    return {};
  }
}

function saveAll(lists: Record<string, GroceryListItem[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {}
}

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getList(storeKey: string): GroceryListItem[] {
  return loadAll()[storeKey] ?? [];
}

/** Adds an item; silently skips if an unchecked item with the same name already exists. */
export function addItem(
  storeKey: string,
  item: Pick<GroceryListItem, 'name' | 'category' | 'itemId'>
): void {
  const all = loadAll();
  const list = all[storeKey] ?? [];
  const dup = list.find(
    (i) => !i.checked && i.name.toLowerCase() === item.name.toLowerCase()
  );
  if (dup) return;
  all[storeKey] = [
    {
      id: makeId(),
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      checked: false,
      addedAt: new Date().toISOString(),
      checkedAt: null,
    },
    ...list,
  ];
  saveAll(all);
}

/** Toggles checked ↔ unchecked, recording the timestamp when checked. */
export function toggleItem(storeKey: string, id: string): void {
  const all = loadAll();
  all[storeKey] = (all[storeKey] ?? []).map((item) =>
    item.id === id
      ? {
          ...item,
          checked: !item.checked,
          checkedAt: item.checked ? null : new Date().toISOString(),
        }
      : item
  );
  saveAll(all);
}

/** Removes an item entirely. */
export function removeItem(storeKey: string, id: string): void {
  const all = loadAll();
  all[storeKey] = (all[storeKey] ?? []).filter((i) => i.id !== id);
  saveAll(all);
}

/** Re-adds a history (checked) item to the active list. */
export function reAddItem(storeKey: string, id: string): void {
  const all = loadAll();
  all[storeKey] = (all[storeKey] ?? []).map((item) =>
    item.id === id ? { ...item, checked: false, checkedAt: null } : item
  );
  saveAll(all);
}

/** Removes all checked (history) items for a store. */
export function clearHistory(storeKey: string): void {
  const all = loadAll();
  all[storeKey] = (all[storeKey] ?? []).filter((i) => !i.checked);
  saveAll(all);
}
