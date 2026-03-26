import type { ChainKey } from './stores';

export interface SampleItem {
  name: string;
  category: string;
}

const GENERIC: SampleItem[] = [
  { name: 'Whole Milk (1 gal)',       category: 'Dairy' },
  { name: 'White Sandwich Bread',     category: 'Bakery' },
  { name: 'Large Eggs (12 ct)',        category: 'Dairy' },
  { name: 'Bananas',                   category: 'Produce' },
  { name: 'Boneless Chicken Breast',  category: 'Meat' },
  { name: 'Spaghetti Pasta',          category: 'Dry Goods' },
  { name: 'Canned Diced Tomatoes',    category: 'Canned Goods' },
  { name: 'Orange Juice (52 oz)',      category: 'Beverages' },
  { name: 'Unsalted Butter',          category: 'Dairy' },
  { name: 'Greek Yogurt',             category: 'Dairy' },
];

const BY_CHAIN: Partial<Record<ChainKey, SampleItem[]>> = {
  costco: [
    { name: 'Rotisserie Chicken',              category: 'Deli' },
    { name: 'Kirkland Organic Olive Oil',      category: 'Oils & Condiments' },
    { name: 'Organic Baby Spinach (1 lb)',     category: 'Produce' },
    { name: 'Kirkland Mixed Nuts (2.5 lb)',    category: 'Snacks' },
    { name: 'Atlantic Salmon Fillet',          category: 'Seafood' },
    { name: 'Kirkland Cheddar Cheese (2 lb)', category: 'Dairy' },
    { name: 'Bounty Paper Towels (12 pk)',     category: 'Household' },
    { name: 'Kirkland Laundry Pods',           category: 'Household' },
    { name: 'Kirkland Coffee Beans (3 lb)',    category: 'Beverages' },
    { name: 'Chobani Greek Yogurt (18 ct)',    category: 'Dairy' },
  ],
  traderjoes: [
    { name: 'Mandarin Chicken',                    category: 'Frozen' },
    { name: 'Everything But The Bagel Seasoning',  category: 'Spices' },
    { name: 'Cauliflower Gnocchi',                 category: 'Frozen' },
    { name: 'Dark Chocolate Bar 72%',              category: 'Snacks' },
    { name: 'Cookie Butter',                       category: 'Spreads' },
    { name: 'Frozen Orange Chicken',               category: 'Frozen' },
    { name: 'Sparkling Water (12 ct)',             category: 'Beverages' },
    { name: 'Organic Bananas',                     category: 'Produce' },
    { name: 'Sourdough Bread',                     category: 'Bakery' },
    { name: 'Unexpected Cheddar',                  category: 'Dairy' },
  ],
  wholefoods: [
    { name: 'Organic Chicken Breast',        category: 'Meat' },
    { name: 'Wild-Caught Salmon',            category: 'Seafood' },
    { name: 'Organic Almond Milk',           category: 'Dairy' },
    { name: 'Organic Kale',                  category: 'Produce' },
    { name: 'Organic Quinoa',                category: 'Dry Goods' },
    { name: "GT's Kombucha",                 category: 'Beverages' },
    { name: 'Raw Honey',                     category: 'Pantry' },
    { name: 'Organic Avocados (4 ct)',        category: 'Produce' },
    { name: 'Organic Coconut Oil',           category: 'Oils & Condiments' },
    { name: 'Gluten-Free Sandwich Bread',    category: 'Bakery' },
  ],
  sprouts: [
    { name: 'Organic Pink Lady Apples',  category: 'Produce' },
    { name: 'Organic Hemp Seeds',        category: 'Health' },
    { name: 'Almond Flour (1 lb)',       category: 'Baking' },
    { name: 'Grass-Fed Ground Beef',     category: 'Meat' },
    { name: 'Oat Milk (half-gal)',       category: 'Dairy' },
    { name: 'Organic Dried Mango',       category: 'Snacks' },
    { name: 'Vanilla Protein Powder',    category: 'Health' },
    { name: 'Organic Ground Turmeric',   category: 'Spices' },
    { name: 'Garden of Life Probiotics', category: 'Health' },
    { name: 'Local Raw Honey',           category: 'Pantry' },
  ],
  '99ranch': [
    { name: 'Jasmine Rice (25 lb)',          category: 'Dry Goods' },
    { name: 'Premium Soy Sauce',             category: 'Condiments' },
    { name: 'Baby Bok Choy',                 category: 'Produce' },
    { name: 'Fresh Ramen Noodles',           category: 'Noodles' },
    { name: 'Firm Tofu',                     category: 'Dairy' },
    { name: 'Fish Sauce',                    category: 'Condiments' },
    { name: 'Pork & Chive Dumplings',        category: 'Frozen' },
    { name: 'Jasmine Green Tea',             category: 'Beverages' },
    { name: 'White Miso Paste',              category: 'Condiments' },
    { name: 'Sesame Oil',                    category: 'Oils & Condiments' },
  ],
  northgate: [
    { name: 'Corn Tortillas (30 ct)',        category: 'Bread' },
    { name: 'Queso Fresco',                  category: 'Dairy' },
    { name: 'Fresh Jalapeños',              category: 'Produce' },
    { name: 'Dried Guajillo Chiles',         category: 'Spices' },
    { name: 'Pork Chorizo',                  category: 'Meat' },
    { name: 'Masa Harina',                   category: 'Baking' },
    { name: 'Mexican Crema',                 category: 'Dairy' },
    { name: 'Ripe Avocados',                 category: 'Produce' },
    { name: 'Fresh Cilantro',                category: 'Produce' },
    { name: 'Chipotle Peppers in Adobo',     category: 'Canned Goods' },
  ],
};

export function getSampleItems(chainKey: ChainKey | null | undefined): SampleItem[] {
  if (!chainKey) return GENERIC;
  return BY_CHAIN[chainKey] ?? GENERIC;
}
