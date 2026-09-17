export const sampleCatalogId = "6aa75e3e337509005eebb467";
export const sampleWorkspaceId = "6aa75e37db69160082adb7ae";

type SampleRow = readonly [id: string, type: string, category: string, name: string, description: string, price: number, imageId: string];

const rows: SampleRow[] = [
  ["101", "Retail", "Electronics", "Smartphone", "Sleek and powerful smartphone", 499, "667d614dd98173078a8bf4c0"],
  ["102", "Retail", "Electronics", "Laptop", "High-performance laptop", 899, "667d61e81adc71079ae23f60"],
  ["103", "Retail", "Apparel", "T-Shirt", "Comfortable cotton t-shirt", 19, "667d614dd9817305fd8c0099"],
  ["104", "Retail", "Apparel", "Jeans", "Stylish denim jeans", 49, "667d614d6aaca20992c86062"],
  ["105", "Retail", "Home & Garden", "Coffee Maker", "Automatic drip coffee maker", 79, "667d614cd9817305fd8c0098"],
  ["106", "Retail", "Home & Garden", "Sofa", "Cozy three-seater sofa", 499, "667d614e6aaca20a66c85da8"],
  ["107", "Retail", "Sports", "Running Shoes", "Lightweight running shoes", 120, "667d614e6aaca20d3bc85bdc"],
  ["108", "Retail", "Sports", "Yoga Mat", "Non-slip yoga mat", 30, "667d614d1adc71079ae23efc"],
  ["109", "Retail", "Toys", "Action Figure", "Collectible superhero figure", 25, "667d614d6aaca20a66c85da7"],
  ["110", "Retail", "Toys", "Board Game", "Fun family board game", 35, "667d614e6aaca20a66c85da8"],
  ["111", "Retail", "Grocery", "Olive Oil", "Extra virgin olive oil", 12, "667d614c1adc71091fe1e4ff"],
  ["112", "Retail", "Grocery", "Organic Honey", "Pure organic honey", 15, "667d614dd981730b5e8bf00b"],
  ["113", "Financial Services", "Investment", "Retirement Plan", "Secure your future with our retirement plan", 750, "667d6e061adc71091fe1e8f9"],
  ["114", "Financial Services", "Investment", "Mutual Fund", "Diversified investment portfolio", 500, "667d64c6d9817309a08bf1c4"],
  ["115", "Financial Services", "Insurance", "Family Health Plan", "Comprehensive health coverage", 1200, "667d64c66aaca20992c8618d"],
  ["116", "Financial Services", "Insurance", "Term Life Policy", "Affordable term life insurance", 750, "667d64c66aaca20a66c85e1a"],
  ["117", "Financial Services", "FinTech", "Mobile Wallet App", "Secure and convenient payments", 2.99, "667d64c6d9817305fd8c0198"],
  ["118", "Financial Services", "FinTech", "Budget Tracker Software", "Manage your finances easily", 30, "667d64c6d98173078a8bf4f2"],
  ["119", "Financial Services", "Insurance", "Comprehensive Auto Policy", "Complete vehicle protection", 900, "667d6546d9817305fd8c019a"],
  ["120", "Travel", "Hotel", "Standard Room", "Cozy room with essential amenities", 80, "667d68661adc71079ae240e5"],
  ["121", "Travel", "Hotel", "Breakfast Buffet", "All-you-can-eat breakfast buffet", 15, "667d6866d98173078a8bf5db"],
  ["122", "Travel", "Hotel", "Spa Package", "Relaxing spa treatments", 70, "667d68666aaca20a66c85eda"],
  ["123", "Travel", "Air Travel", "Economy Flight Ticket", "Affordable ticket for economy class", 300, "667d68661adc71091fe1e625"],
  ["124", "Travel", "Air Travel", "In-Flight Meal", "Delicious meal for in-flight dining", 15, "667d68661adc710ab7e1e35e"],
  ["125", "Travel", "Air Travel", "Extra Baggage Allowance", "Additional checked baggage allowance", 50, "667d68666aaca20992c862dd"],
  ["126", "Gaming", "Video Game", "Adventure Quest", "Epic adventure game with stunning graphics", 49.99, "667d6c4d6aaca20992c8636b"],
  ["127", "Gaming", "DLC", "Expansion Pack", "Additional content for your favorite game", 19.99, "667d6c4d1adc71091fe1e6d1"],
  ["128", "Gaming", "DLC", "Avatar Upgrade", "Additional content for your main character", 15.99, "667d6c4d6aaca20a66c85f08"],
  ["129", "Gaming", "DLC", "Character Pack: Heroes of the Realm", "Unlock new playable characters", 9.99, "667d6c4d1adc710ab7e1e378"],
  ["130", "Gaming", "DLC", "Weapon Pack: Ultimate Arsenal", "Access exclusive weapons and gear", 7.99, "667d6c4dd98173078a8bf877"],
  ["131", "Gaming", "Video Game", "Space Odyssey", "Immersive space exploration game", 59.99, "667d6ebb6aaca20992c864d7"],
];

export const sampleCatalogRows = rows.map(([id, type, category, name, description, price, imageId]) => ({
  id,
  name,
  fields: {
    Product_id: id,
    Product_type: type,
    Product_category: category,
    item_name: name,
    description,
    price,
    image: `https://cdn-staging.braze.com/appboy/communication/assets/image_assets/images/${imageId}/original.jpeg${id === "131" ? "?1719496378" : ""}`,
  },
}));
