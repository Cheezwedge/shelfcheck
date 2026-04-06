export interface GroceryListItem {
  id: string;
  itemId: string | null;
  name: string;
  category: string;
  quantity: number;        // always ≥ 1
  checked: boolean;
  addedAt: string;
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
  // Migrate old items that don't have a quantity field
  return (loadAll()[storeKey] ?? []).map((i) => ({
    ...i,
    quantity: i.quantity ?? 1,
  }));
}

/**
 * Adds an item to the list.
 * - If an unchecked item with the same name exists → increment quantity.
 * - If a checked (history) item with the same name exists → re-add it (prevents history duplicates).
 * - Otherwise → add a new item.
 */
export function addItem(
  storeKey: string,
  item: Pick<GroceryListItem, 'name' | 'category' | 'itemId'>
): void {
  const all = loadAll();
  const list = all[storeKey] ?? [];
  const lower = item.name.toLowerCase();

  // 1. Unchecked duplicate → increment quantity
  const uncheckedIdx = list.findIndex((i) => !i.checked && i.name.toLowerCase() === lower);
  if (uncheckedIdx !== -1) {
    all[storeKey] = list.map((i, idx) =>
      idx === uncheckedIdx ? { ...i, quantity: (i.quantity ?? 1) + 1 } : i
    );
    saveAll(all);
    return;
  }

  // 2. Checked (history) duplicate → re-add to active list (no new entry created)
  const checkedIdx = list.findIndex((i) => i.checked && i.name.toLowerCase() === lower);
  if (checkedIdx !== -1) {
    all[storeKey] = list.map((i, idx) =>
      idx === checkedIdx ? { ...i, checked: false, checkedAt: null } : i
    );
    saveAll(all);
    return;
  }

  // 3. Brand new item
  all[storeKey] = [
    {
      id: makeId(),
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      quantity: 1,
      checked: false,
      addedAt: new Date().toISOString(),
      checkedAt: null,
    },
    ...list,
  ];
  saveAll(all);
}

/** Changes quantity by delta; quantity is clamped to minimum 1. */
export function changeQuantity(storeKey: string, id: string, delta: number): void {
  const all = loadAll();
  all[storeKey] = (all[storeKey] ?? []).map((item) =>
    item.id === id
      ? { ...item, quantity: Math.max(1, (item.quantity ?? 1) + delta) }
      : item
  );
  saveAll(all);
}

/** Toggles checked ↔ unchecked. */
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

/** Clears all grocery lists (called on sign-out). */
export function clearAllLists(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
