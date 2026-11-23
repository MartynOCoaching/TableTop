import React, { useMemo, useState } from 'react';
import {
  Check,
  MonitorPlay,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { MenuCategory, MenuItem } from '../types';
import { MediaAsset } from './MediaAsset';
import { MediaDropzone, UploadedMediaResult } from './MediaDropzone';

interface MenuManagerProps {
  categories: MenuCategory[];
  items: MenuItem[];
  onCategoriesChange: (next: MenuCategory[]) => void;
  onItemsChange: (next: MenuItem[]) => void;
  onPreviewMenu: (categoryId?: string, openEmulator?: boolean) => void;
}

function getMenuItemCategoryIds(item: Pick<MenuItem, 'categoryId' | 'categoryIds'>): string[] {
  const rawIds =
    Array.isArray(item.categoryIds) && item.categoryIds.length > 0
      ? item.categoryIds
      : item.categoryId
        ? [item.categoryId]
        : [];
  return Array.from(new Set(rawIds.filter(Boolean)));
}

export const MenuManager: React.FC<MenuManagerProps> = ({
  categories,
  items,
  onCategoriesChange,
  onItemsChange,
  onPreviewMenu,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [formState, setFormState] = useState<Partial<MenuItem>>({
    name: '',
    categoryId: categories[0]?.id ?? '',
    categoryIds: categories[0]?.id ? [categories[0].id] : [],
    price: 14.0,
    description: '',
    dietaryNotes: '',
    available: true,
    featured: false,
  });

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const itemCatIds = getMenuItemCategoryIds(item);
      const matchesCat = selectedCategory === 'all' || itemCatIds.includes(selectedCategory);
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.dietaryNotes.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [items, selectedCategory, searchQuery]);

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const openNewItemForm = () => {
    const initialCategoryId =
      selectedCategory === 'all' ? (categories[0]?.id ?? '') : selectedCategory;
    setEditingItemId(null);
    setCategoryError(null);
    setFormState({
      name: '',
      categoryId: initialCategoryId,
      categoryIds: initialCategoryId ? [initialCategoryId] : [],
      price: 15.0,
      description: '',
      dietaryNotes: '',
      mediaUrl: undefined,
      mediaAssetId: undefined,
      available: true,
      featured: false,
    });
    setIsAddingItem(true);
  };

  const openEditItem = (item: MenuItem) => {
    const assignedIds = getMenuItemCategoryIds(item);
    setIsAddingItem(false);
    setEditingItemId(item.id);
    setCategoryError(null);
    setFormState({
      ...item,
      categoryId: assignedIds[0] ?? item.categoryId,
      categoryIds: assignedIds,
    });
  };

  const closeForm = () => {
    setIsAddingItem(false);
    setEditingItemId(null);
    setCategoryError(null);
  };

  const toggleFormCategory = (catId: string) => {
    setFormState((prev) => {
      const currentIds = Array.isArray(prev.categoryIds)
        ? prev.categoryIds
        : prev.categoryId
          ? [prev.categoryId]
          : [];
      const exists = currentIds.includes(catId);
      const nextIds = exists
        ? currentIds.filter((id) => id !== catId)
        : [...currentIds, catId];
      if (nextIds.length > 0) {
        setCategoryError(null);
      }
      return {
        ...prev,
        categoryId: nextIds[0] ?? '',
        categoryIds: nextIds,
      };
    });
  };

  const handlePhotoUpload = (results: UploadedMediaResult[]) => {
    const first = results[0];
    if (!first) return;
    setFormState((prev) => ({
      ...prev,
      mediaUrl: first.mediaUrl,
      mediaAssetId: first.mediaAssetId,
    }));
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formState.name?.trim();
    if (!cleanName) return;

    const rawSelectedIds = Array.isArray(formState.categoryIds)
      ? formState.categoryIds
      : formState.categoryId
        ? [formState.categoryId]
        : [];
    const selectedIds = Array.from(new Set(rawSelectedIds.filter(Boolean)));

    if (categories.length > 0 && selectedIds.length === 0) {
      setCategoryError('Select at least one category for this menu item.');
      return;
    }

    const finalCategoryIds = selectedIds.length > 0 ? selectedIds : ['cat-uncategorized'];
    const primaryCategoryId = finalCategoryIds[0];
    const price = Math.max(0, Number(formState.price) || 0);

    if (editingItemId) {
      onItemsChange(
        items.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                name: cleanName,
                categoryId: primaryCategoryId,
                categoryIds: finalCategoryIds,
                price,
                description: formState.description?.trim() ?? '',
                dietaryNotes: formState.dietaryNotes?.trim() ?? '',
                mediaUrl: formState.mediaUrl,
                mediaAssetId: formState.mediaAssetId,
                available: formState.available ?? true,
                featured: formState.featured ?? false,
              }
            : item
        )
      );
    } else {
      const newItem: MenuItem = {
        id: `item-${Date.now()}`,
        categoryId: primaryCategoryId,
        categoryIds: finalCategoryIds,
        name: cleanName,
        description: formState.description?.trim() ?? '',
        price,
        dietaryNotes: formState.dietaryNotes?.trim() ?? '',
        mediaUrl: formState.mediaUrl,
        mediaAssetId: formState.mediaAssetId,
        available: formState.available ?? true,
        featured: formState.featured ?? false,
      };
      onItemsChange([newItem, ...items]);
    }

    const previewCategoryId = finalCategoryIds.includes(selectedCategory)
      ? selectedCategory
      : primaryCategoryId;
    onPreviewMenu(previewCategoryId, false);
    closeForm();
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) return;
    const id = `cat-${Date.now()}`;
    onCategoriesChange([...categories, { id, name: clean }]);
    setNewCategoryName('');
    setShowAddCategory(false);
    setSelectedCategory(id);
  };

  const toggleAvailable = (id: string) => {
    onItemsChange(
      items.map((item) => (item.id === id ? { ...item, available: !item.available } : item))
    );
  };

  const toggleFeatured = (id: string) => {
    onItemsChange(
      items.map((item) => (item.id === id ? { ...item, featured: !item.featured } : item))
    );
  };

  const deleteItem = (id: string) => {
    onItemsChange(items.filter((item) => item.id !== id));
    if (editingItemId === id) closeForm();
  };

  const isFormOpen = isAddingItem || editingItemId !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Tabletop Menu</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Update items, pricing, dietary notes, and 86’d availability across all guest tables.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPreviewMenu(selectedCategory === 'all' ? undefined : selectedCategory)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap shrink-0"
          >
            <MonitorPlay className="w-3.5 h-3.5" aria-hidden="true" />
            Open Menu View
          </button>
          <button
            type="button"
            onClick={openNewItemForm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Menu Item
          </button>
        </div>
      </div>

      {isFormOpen && (
        <form
          onSubmit={handleSaveItem}
          className="rounded-xl border border-slate-300 bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {editingItemId ? 'Edit Menu Item' : 'New Menu Item'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Item Name</label>
              <input
                type="text"
                required
                value={formState.name ?? ''}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                placeholder="e.g. Charred Octopus Flatbread"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Price ($)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                required
                value={formState.price ?? 0}
                onChange={(e) => setFormState({ ...formState, price: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-medium text-slate-600">
                  Categories <span className="font-normal text-slate-400">(Select one or more)</span>
                </label>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {(formState.categoryIds?.length ?? 0)} selected
                </span>
              </div>
              {categories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                  No categories yet — create a category below to organize menu items.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map((cat) => {
                    const selected = (formState.categoryIds ?? []).includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer transition-colors select-none ${
                          selected
                            ? 'border-amber-600 bg-amber-50/70 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleFormCategory(cat.id)}
                          className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                        />
                        <span className="truncate">{cat.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {categoryError && (
                <p className="text-xs text-red-600 mt-1.5">{categoryError}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Dietary / Pour Note
              </label>
              <input
                type="text"
                value={formState.dietaryNotes ?? ''}
                onChange={(e) => setFormState({ ...formState, dietaryNotes: e.target.value })}
                placeholder="e.g. Gluten-Free · 6.5% ABV"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              rows={2}
              value={formState.description ?? ''}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              placeholder="Ingredients, tasting notes, or preparation style..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="sm:col-span-2">
              <MediaDropzone
                onUpload={handlePhotoUpload}
                acceptVideo={false}
                compact
                title={formState.mediaUrl ? 'Drop a new photo to replace dish image' : 'Drag and drop dish photo (optional)'}
                subtitle="JPG, PNG, WebP"
              />
            </div>
            <div className="flex items-center gap-3">
              {formState.mediaUrl ? (
                <div className="relative w-20 h-16 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                  <MediaAsset src={formState.mediaUrl} alt={formState.name || 'Dish'} />
                  <button
                    type="button"
                    onClick={() =>
                      setFormState({ ...formState, mediaUrl: undefined, mediaAssetId: undefined })
                    }
                    title="Remove photo"
                    className="absolute top-1 right-1 rounded bg-slate-950/75 p-0.5 text-white hover:bg-slate-950"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-400">No photo attached</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-5">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.available ?? true}
                  onChange={(e) => setFormState({ ...formState, available: e.target.checked })}
                  className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                Available to order
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.featured ?? false}
                  onChange={(e) => setFormState({ ...formState, featured: e.target.checked })}
                  className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                House favorite
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                {editingItemId ? 'Save Changes' : 'Add to Menu'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Category Filter Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, drinks, or dietary notes..."
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
            />
          </div>

          {showAddCategory ? (
            <form onSubmit={handleAddCategory} className="flex items-center gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                autoFocus
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddCategory(false)}
                className="p-2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddCategory(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              New Category
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            All ({items.length})
          </button>
          {categories.map((cat) => {
            const count = items.filter((i) => getMenuItemCategoryIds(i).includes(cat.id)).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  onPreviewMenu(cat.id, false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Items List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">No matching menu items</p>
          <p className="text-xs text-slate-500 mt-1">
            Clear your filter or add a new dish or drink to display on tabletop screens.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-slate-50/70 ${
                !item.available ? 'opacity-65 bg-slate-50/40' : ''
              }`}
            >
              {item.mediaUrl ? (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 shrink-0">
                  <MediaAsset src={item.mediaUrl} alt={item.name} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-400 shrink-0">
                  No img
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <h4 className="text-sm font-medium text-slate-900 truncate">{item.name}</h4>
                  {item.featured && (
                    <span className="text-xs font-medium text-amber-700 shrink-0">Favorite</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  <span>
                    {(() => {
                      const names = getMenuItemCategoryIds(item)
                        .map((id) => categoryNameMap.get(id))
                        .filter((name): name is string => Boolean(name));
                      return names.length > 0 ? names.join(', ') : 'Uncategorized';
                    })()}
                  </span>
                  {item.dietaryNotes && (
                    <>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{item.dietaryNotes}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0 pr-2">
                <div className="text-sm font-mono font-medium text-slate-900 tabular-nums">
                  ${item.price.toFixed(2)}
                </div>
                <button
                  type="button"
                  onClick={() => toggleAvailable(item.id)}
                  className={`text-xs font-medium hover:underline whitespace-nowrap ${
                    item.available ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {item.available ? 'In Stock' : "86'd / Out"}
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleFeatured(item.id)}
                  title={item.featured ? 'Remove house favorite' : 'Mark house favorite'}
                  className={`p-1.5 rounded-md transition-colors ${
                    item.featured
                      ? 'text-amber-600 bg-amber-50'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Star className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditItem(item)}
                  title="Edit item"
                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(item.id)}
                  title="Delete item"
                  className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
