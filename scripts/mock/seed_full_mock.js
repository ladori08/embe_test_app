const dbName = "embe";
const appDb = db.getSiblingDB(dbName);

const now = new Date();
const daysAgo = (days, hours = 0) => new Date(now.getTime() - (((days * 24) + hours) * 60 * 60 * 1000));
const minutesFromNow = minutes => new Date(now.getTime() + (minutes * 60 * 1000));
const D = value => NumberDecimal(String(value));
const O = value => ObjectId(value);

const fallbackPasswordHash = "$2y$10$9DtalSS8IsTsqZbVUnenteIBiEK/c4.s5jklXPP0x3Ivksdbp8Rbu";
const existingSuperadmin = appDb.users.findOne({ email: "superadmin@123.com" }) || {};

const ids = {
  users: {
    superadmin: existingSuperadmin._id || O("66f100000000000000000001"),
    admin: O("66f100000000000000000002"),
    customerA: O("66f100000000000000000003"),
    customerB: O("66f100000000000000000004")
  },
  categories: {
    pastry: O("66f100000000000000000101"),
    cookie: O("66f100000000000000000102"),
    cake: O("66f100000000000000000103")
  },
  ingredients: {
    flour: O("66f100000000000000000201"),
    sugar: O("66f100000000000000000202"),
    butter: O("66f100000000000000000203"),
    egg: O("66f100000000000000000204"),
    milk: O("66f100000000000000000205"),
    yeast: O("66f100000000000000000206"),
    salt: O("66f100000000000000000207"),
    choco: O("66f100000000000000000208"),
    matcha: O("66f100000000000000000209"),
    creamCheese: O("66f10000000000000000020a"),
    kahlua: O("66f10000000000000000020b"),
    marshmallow: O("66f10000000000000000020c"),
    box: O("66f10000000000000000020d")
  },
  products: {
    croissant: O("66f100000000000000000301"),
    cookie: O("66f100000000000000000302"),
    cheesecake: O("66f100000000000000000303"),
    tiramisu: O("66f100000000000000000304"),
    brownie: O("66f100000000000000000305"),
    sourdough: O("66f100000000000000000306")
  },
  recipes: {
    croissant: O("66f100000000000000000401"),
    cookie: O("66f100000000000000000402"),
    cheesecake: O("66f100000000000000000403"),
    tiramisu: O("66f100000000000000000404"),
    sourdough: O("66f100000000000000000405")
  },
  bakes: {
    croissant: O("66f100000000000000000501"),
    cookie: O("66f100000000000000000502"),
    cheesecake: O("66f100000000000000000503"),
    tiramisu: O("66f100000000000000000504")
  },
  orders: {
    newGuest: O("66f100000000000000000701"),
    confirmed: O("66f100000000000000000702"),
    paid: O("66f100000000000000000703"),
    completed: O("66f100000000000000000704"),
    cancelled: O("66f100000000000000000705"),
    newCustomer: O("66f100000000000000000706")
  }
};

const collections = [
  "users",
  "product_categories",
  "ingredients",
  "ingredient_stock_transactions",
  "products",
  "recipes",
  "recipe_revisions",
  "bake_records",
  "product_lots",
  "product_stock_logs",
  "orders",
  "audit_logs"
];

collections.forEach(name => appDb.getCollection(name).deleteMany({}));

appDb.users.insertMany([
  {
    _id: ids.users.superadmin,
    email: "superadmin@123.com",
    fullName: "Super Admin",
    passwordHash: existingSuperadmin.passwordHash || fallbackPasswordHash,
    roles: ["SUPERADMIN"],
    createdAt: existingSuperadmin.createdAt || daysAgo(120)
  },
  {
    _id: ids.users.admin,
    email: "admin@example.com",
    fullName: "Admin Staff",
    passwordHash: existingSuperadmin.passwordHash || fallbackPasswordHash,
    roles: ["ADMIN"],
    createdAt: daysAgo(60)
  },
  {
    _id: ids.users.customerA,
    email: "customer.a@example.com",
    fullName: "Khach Le A",
    passwordHash: existingSuperadmin.passwordHash || fallbackPasswordHash,
    roles: ["CUSTOMER"],
    createdAt: daysAgo(40)
  },
  {
    _id: ids.users.customerB,
    email: "customer.b@example.com",
    fullName: "Khach Le B",
    passwordHash: existingSuperadmin.passwordHash || fallbackPasswordHash,
    roles: ["CUSTOMER"],
    createdAt: daysAgo(20)
  }
]);

appDb.product_categories.insertMany([
  {
    _id: ids.categories.pastry,
    name: "Banh ngan lop",
    nameKey: "banh-ngan-lop",
    sku: "PASTR-00001",
    legacySkus: ["PASTR-00000"],
    createdAt: daysAgo(90),
    updatedAt: daysAgo(10)
  },
  {
    _id: ids.categories.cookie,
    name: "Banh quy",
    nameKey: "banh-quy",
    sku: "COOKI-00001",
    legacySkus: [],
    createdAt: daysAgo(90),
    updatedAt: daysAgo(5)
  },
  {
    _id: ids.categories.cake,
    name: "Banh kem",
    nameKey: "banh-kem",
    sku: "CAKES-00001",
    legacySkus: ["CAKES-00000"],
    createdAt: daysAgo(90),
    updatedAt: daysAgo(2)
  }
]);

const ingredients = [
  { _id: ids.ingredients.flour, name: "Bot mi", ingredientCode: "D0001", unit: "kg", currentStock: D("12.5"), reorderLevel: D("3"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(1) },
  { _id: ids.ingredients.sugar, name: "Duong cat", ingredientCode: "D0002", unit: "kg", currentStock: D("6.2"), reorderLevel: D("2"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(1) },
  { _id: ids.ingredients.butter, name: "Bo lat", ingredientCode: "D0003", unit: "kg", currentStock: D("4.8"), reorderLevel: D("1.5"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(1) },
  { _id: ids.ingredients.egg, name: "Trung ga", ingredientCode: "D0004", unit: "qua", currentStock: D("120"), reorderLevel: D("40"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(1) },
  { _id: ids.ingredients.milk, name: "Sua tuoi", ingredientCode: "D0005", unit: "l", currentStock: D("18"), reorderLevel: D("5"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(1) },
  { _id: ids.ingredients.yeast, name: "Men no", ingredientCode: "D0006", unit: "kg", currentStock: D("1.5"), reorderLevel: D("0.4"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
  { _id: ids.ingredients.salt, name: "Muoi", ingredientCode: "D0007", unit: "kg", currentStock: D("2.2"), reorderLevel: D("0.5"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
  { _id: ids.ingredients.choco, name: "Chocolate chip", ingredientCode: "D0008", unit: "kg", currentStock: D("3.1"), reorderLevel: D("1"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
  { _id: ids.ingredients.matcha, name: "Bot matcha", ingredientCode: "D0009", unit: "kg", currentStock: D("0.9"), reorderLevel: D("0.3"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
  { _id: ids.ingredients.creamCheese, name: "Pho mai kem", ingredientCode: "D0010", unit: "kg", currentStock: D("2"), reorderLevel: D("0.8"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
  { _id: ids.ingredients.kahlua, name: "Kahlua", ingredientCode: "D0011", unit: "l", currentStock: D("2.5"), reorderLevel: D("0.7"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
  { _id: ids.ingredients.marshmallow, name: "Marshmallow", ingredientCode: "D0012", unit: "kg", currentStock: D("0.6"), reorderLevel: D("0.2"), costTrackingMethod: "FIFO", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
  { _id: ids.ingredients.box, name: "Hop dung banh", ingredientCode: "D0013", unit: "psc", currentStock: D("200"), reorderLevel: D("50"), costTrackingMethod: "AVG_BIN", createdAt: daysAgo(120), updatedAt: daysAgo(1) }
];
appDb.ingredients.insertMany(ingredients);

const byName = Object.fromEntries(ingredients.map(item => [item.name, item]));
const inTx = (_id, ingredient, lotCode, qty, remainingQty, unitCost, createdAt, note) => ({
  _id,
  ingredientId: ingredient._id,
  ingredientName: ingredient.name,
  type: "IN",
  qty: D(qty),
  unitCost: D(unitCost),
  inputUnit: ingredient.unit,
  lotCode,
  remainingQty: D(remainingQty),
  allocations: [],
  note,
  createdAt,
  createdBy: "superadmin@123.com"
});
const outTx = (_id, ingredient, qty, allocations, createdAt, note) => ({
  _id,
  ingredientId: ingredient._id,
  ingredientName: ingredient.name,
  type: "OUT",
  qty: D(qty),
  unitCost: null,
  inputUnit: ingredient.unit,
  lotCode: null,
  remainingQty: null,
  allocations: allocations.map(item => ({
    lotCode: item.lotCode,
    qty: D(item.qty),
    unitCost: D(item.unitCost)
  })),
  note,
  createdAt,
  createdBy: "admin@example.com"
});

appDb.ingredient_stock_transactions.insertMany([
  inTx(O("66f100000000000000000901"), byName["Bot mi"], "LOT-BMI-240101", "10", "4", "28000", daysAgo(85), "Nhap kho dau thang"),
  inTx(O("66f100000000000000000902"), byName["Bot mi"], "LOT-BMI-240212", "12", "8.5", "30000", daysAgo(42), "Nhap kho bo sung"),
  outTx(O("66f100000000000000000903"), byName["Bot mi"], "9.5", [{ lotCode: "LOT-BMI-240101", qty: "6", unitCost: "28000" }, { lotCode: "LOT-BMI-240212", qty: "3.5", unitCost: "30000" }], daysAgo(3), "Tru theo me san xuat"),

  inTx(O("66f100000000000000000904"), byName["Duong cat"], "LOT-DCA-240101", "5", "1.2", "24000", daysAgo(85), "Nhap kho"),
  inTx(O("66f100000000000000000905"), byName["Duong cat"], "LOT-DCA-240220", "8", "5", "25500", daysAgo(34), "Nhap kho"),
  outTx(O("66f100000000000000000906"), byName["Duong cat"], "6.8", [{ lotCode: "LOT-DCA-240101", qty: "3.8", unitCost: "24000" }, { lotCode: "LOT-DCA-240220", qty: "3", unitCost: "25500" }], daysAgo(2), "Tru theo me san xuat"),

  inTx(O("66f100000000000000000907"), byName["Bo lat"], "LOT-BLT-240108", "4", "1.3", "175000", daysAgo(80), "Nhap kho"),
  inTx(O("66f100000000000000000908"), byName["Bo lat"], "LOT-BLT-240228", "5", "3.5", "182000", daysAgo(26), "Nhap kho"),
  outTx(O("66f100000000000000000909"), byName["Bo lat"], "4.2", [{ lotCode: "LOT-BLT-240108", qty: "2.7", unitCost: "175000" }, { lotCode: "LOT-BLT-240228", qty: "1.5", unitCost: "182000" }], daysAgo(2), "Tru theo me san xuat"),

  inTx(O("66f10000000000000000090a"), byName["Trung ga"], "LOT-TGA-240110", "120", "80", "2500", daysAgo(78), "Nhap kho"),
  inTx(O("66f10000000000000000090b"), byName["Trung ga"], "LOT-TGA-240301", "100", "40", "2700", daysAgo(24), "Nhap kho"),
  outTx(O("66f10000000000000000090c"), byName["Trung ga"], "100", [{ lotCode: "LOT-TGA-240110", qty: "40", unitCost: "2500" }, { lotCode: "LOT-TGA-240301", qty: "60", unitCost: "2700" }], daysAgo(1), "Tru theo me san xuat"),

  inTx(O("66f10000000000000000090d"), byName["Sua tuoi"], "LOT-STU-240111", "12", "6", "28000", daysAgo(77), "Nhap kho"),
  inTx(O("66f10000000000000000090e"), byName["Sua tuoi"], "LOT-STU-240305", "16", "12", "30000", daysAgo(20), "Nhap kho"),
  outTx(O("66f10000000000000000090f"), byName["Sua tuoi"], "10", [{ lotCode: "LOT-STU-240111", qty: "6", unitCost: "28000" }, { lotCode: "LOT-STU-240305", qty: "4", unitCost: "30000" }], daysAgo(1), "Tru theo me san xuat"),

  inTx(O("66f100000000000000000910"), byName["Men no"], "LOT-MNO-240115", "1", "0.5", "210000", daysAgo(73), "Nhap kho"),
  inTx(O("66f100000000000000000911"), byName["Men no"], "LOT-MNO-240306", "1.2", "1", "225000", daysAgo(19), "Nhap kho"),

  inTx(O("66f100000000000000000912"), byName["Muoi"], "LOT-MUI-240119", "2", "1.2", "5000", daysAgo(69), "Nhap kho"),
  inTx(O("66f100000000000000000913"), byName["Muoi"], "LOT-MUI-240307", "2", "1", "5200", daysAgo(18), "Nhap kho"),

  inTx(O("66f100000000000000000914"), byName["Chocolate chip"], "LOT-CCP-240120", "2", "0.6", "220000", daysAgo(68), "Nhap kho"),
  inTx(O("66f100000000000000000915"), byName["Chocolate chip"], "LOT-CCP-240306", "3", "2.5", "235000", daysAgo(19), "Nhap kho"),

  inTx(O("66f100000000000000000916"), byName["Bot matcha"], "LOT-MAT-240122", "1", "0.2", "680000", daysAgo(66), "Nhap kho"),
  inTx(O("66f100000000000000000917"), byName["Bot matcha"], "LOT-MAT-240310", "1", "0.7", "720000", daysAgo(15), "Nhap kho"),

  inTx(O("66f100000000000000000918"), byName["Pho mai kem"], "LOT-PMK-240124", "1.5", "0.5", "260000", daysAgo(64), "Nhap kho"),
  inTx(O("66f100000000000000000919"), byName["Pho mai kem"], "LOT-PMK-240312", "2", "1.5", "280000", daysAgo(13), "Nhap kho"),

  inTx(O("66f10000000000000000091a"), byName["Kahlua"], "LOT-KAH-240128", "1", "0.3", "420000", daysAgo(60), "Nhap kho"),
  inTx(O("66f10000000000000000091b"), byName["Kahlua"], "LOT-KAH-240314", "2.5", "2.2", "450000", daysAgo(11), "Nhap kho"),

  inTx(O("66f10000000000000000091c"), byName["Marshmallow"], "LOT-MSH-240318", "1", "0.6", "130000", daysAgo(7), "Nhap kho"),
  inTx(O("66f10000000000000000091d"), byName["Hop dung banh"], "LOT-HDB-240201", "300", "200", "3500", daysAgo(55), "Nhap kho"),
  outTx(O("66f10000000000000000091e"), byName["Hop dung banh"], "100", [{ lotCode: "LOT-HDB-240201", qty: "100", unitCost: "3500" }], daysAgo(1), "Su dung dong goi don hang")
]);

appDb.products.insertMany([
  { _id: ids.products.croissant, name: "Croissant Bo", sku: "PASTR-00011", category: "Banh ngan lop", price: D("35000"), cost: D("18500"), currentStock: D("45"), active: true, images: [], createdAt: daysAgo(90), updatedAt: daysAgo(1) },
  { _id: ids.products.cookie, name: "Cookie Cha Bong", sku: "COOKI-00021", category: "Banh quy", price: D("55000"), cost: D("29000"), currentStock: D("22"), active: true, images: [], createdAt: daysAgo(90), updatedAt: daysAgo(1) },
  { _id: ids.products.cheesecake, name: "Matcha Cheesecake", sku: "CAKES-00031", category: "Banh kem", price: D("120000"), cost: D("68000"), currentStock: D("8"), active: true, images: [], createdAt: daysAgo(80), updatedAt: daysAgo(1) },
  { _id: ids.products.tiramisu, name: "Tiramisu Kahlua", sku: "CAKES-00032", category: "Banh kem", price: D("130000"), cost: D("70000"), currentStock: D("6"), active: true, images: [], createdAt: daysAgo(75), updatedAt: daysAgo(1) },
  { _id: ids.products.brownie, name: "Brownie Socola", sku: "CAKES-00033", category: "Banh kem", price: D("85000"), cost: D("45000"), currentStock: D("0"), active: false, images: [], createdAt: daysAgo(70), updatedAt: daysAgo(3) },
  { _id: ids.products.sourdough, name: "Sourdough Mini", sku: "PASTR-00012", category: "Banh ngan lop", price: D("40000"), cost: D("21000"), currentStock: D("12"), active: true, images: [], createdAt: daysAgo(65), updatedAt: daysAgo(1) }
]);

appDb.recipes.insertMany([
  {
    _id: ids.recipes.croissant,
    productId: ids.products.croissant,
    version: 2,
    yieldQty: D("20"),
    items: [
      { ingredientId: ids.ingredients.flour, qtyPerBatch: D("0.8") },
      { ingredientId: ids.ingredients.butter, qtyPerBatch: D("0.35") },
      { ingredientId: ids.ingredients.milk, qtyPerBatch: D("0.5") },
      { ingredientId: ids.ingredients.yeast, qtyPerBatch: D("0.03") },
      { ingredientId: ids.ingredients.sugar, qtyPerBatch: D("0.05") },
      { ingredientId: ids.ingredients.salt, qtyPerBatch: D("0.01") }
    ],
    createdAt: daysAgo(88),
    updatedAt: daysAgo(3)
  },
  {
    _id: ids.recipes.cookie,
    productId: ids.products.cookie,
    version: 1,
    yieldQty: D("30"),
    items: [
      { ingredientId: ids.ingredients.flour, qtyPerBatch: D("0.5") },
      { ingredientId: ids.ingredients.sugar, qtyPerBatch: D("0.25") },
      { ingredientId: ids.ingredients.butter, qtyPerBatch: D("0.2") },
      { ingredientId: ids.ingredients.egg, qtyPerBatch: D("2") },
      { ingredientId: ids.ingredients.choco, qtyPerBatch: D("0.3") },
      { ingredientId: ids.ingredients.salt, qtyPerBatch: D("0.005") }
    ],
    createdAt: daysAgo(80),
    updatedAt: daysAgo(6)
  },
  {
    _id: ids.recipes.cheesecake,
    productId: ids.products.cheesecake,
    version: 1,
    yieldQty: D("8"),
    items: [
      { ingredientId: ids.ingredients.creamCheese, qtyPerBatch: D("0.9") },
      { ingredientId: ids.ingredients.sugar, qtyPerBatch: D("0.2") },
      { ingredientId: ids.ingredients.egg, qtyPerBatch: D("3") },
      { ingredientId: ids.ingredients.matcha, qtyPerBatch: D("0.03") }
    ],
    createdAt: daysAgo(70),
    updatedAt: daysAgo(2)
  },
  {
    _id: ids.recipes.tiramisu,
    productId: ids.products.tiramisu,
    version: 1,
    yieldQty: D("6"),
    items: [
      { ingredientId: ids.ingredients.creamCheese, qtyPerBatch: D("0.8") },
      { ingredientId: ids.ingredients.sugar, qtyPerBatch: D("0.18") },
      { ingredientId: ids.ingredients.egg, qtyPerBatch: D("2") },
      { ingredientId: ids.ingredients.kahlua, qtyPerBatch: D("0.08") },
      { ingredientId: ids.ingredients.milk, qtyPerBatch: D("0.25") }
    ],
    createdAt: daysAgo(66),
    updatedAt: daysAgo(2)
  },
  {
    _id: ids.recipes.sourdough,
    productId: ids.products.sourdough,
    version: 1,
    yieldQty: D("12"),
    items: [
      { ingredientId: ids.ingredients.flour, qtyPerBatch: D("1.1") },
      { ingredientId: ids.ingredients.salt, qtyPerBatch: D("0.02") },
      { ingredientId: ids.ingredients.yeast, qtyPerBatch: D("0.015") },
      { ingredientId: ids.ingredients.milk, qtyPerBatch: D("0.4") }
    ],
    createdAt: daysAgo(62),
    updatedAt: daysAgo(2)
  }
]);

appDb.recipe_revisions.insertMany([
  {
    _id: O("66f100000000000000000451"),
    recipeId: ids.recipes.croissant,
    productId: ids.products.croissant,
    version: 1,
    yieldQty: D("20"),
    items: [
      { ingredientId: ids.ingredients.flour, qtyPerBatch: D("0.75") },
      { ingredientId: ids.ingredients.butter, qtyPerBatch: D("0.32") },
      { ingredientId: ids.ingredients.milk, qtyPerBatch: D("0.5") },
      { ingredientId: ids.ingredients.yeast, qtyPerBatch: D("0.03") }
    ],
    changedAt: daysAgo(40),
    changedBy: "admin@example.com",
    changeType: "CREATE"
  },
  {
    _id: O("66f100000000000000000452"),
    recipeId: ids.recipes.croissant,
    productId: ids.products.croissant,
    version: 2,
    yieldQty: D("20"),
    items: [
      { ingredientId: ids.ingredients.flour, qtyPerBatch: D("0.8") },
      { ingredientId: ids.ingredients.butter, qtyPerBatch: D("0.35") },
      { ingredientId: ids.ingredients.milk, qtyPerBatch: D("0.5") },
      { ingredientId: ids.ingredients.yeast, qtyPerBatch: D("0.03") },
      { ingredientId: ids.ingredients.sugar, qtyPerBatch: D("0.05") },
      { ingredientId: ids.ingredients.salt, qtyPerBatch: D("0.01") }
    ],
    changedAt: daysAgo(3),
    changedBy: "superadmin@123.com",
    changeType: "UPDATE"
  },
  {
    _id: O("66f100000000000000000453"),
    recipeId: ids.recipes.cookie,
    productId: ids.products.cookie,
    version: 1,
    yieldQty: D("30"),
    items: [
      { ingredientId: ids.ingredients.flour, qtyPerBatch: D("0.5") },
      { ingredientId: ids.ingredients.sugar, qtyPerBatch: D("0.25") },
      { ingredientId: ids.ingredients.butter, qtyPerBatch: D("0.2") },
      { ingredientId: ids.ingredients.egg, qtyPerBatch: D("2") },
      { ingredientId: ids.ingredients.choco, qtyPerBatch: D("0.3") }
    ],
    changedAt: daysAgo(6),
    changedBy: "admin@example.com",
    changeType: "CREATE"
  },
  {
    _id: O("66f100000000000000000454"),
    recipeId: ids.recipes.cheesecake,
    productId: ids.products.cheesecake,
    version: 1,
    yieldQty: D("8"),
    items: [
      { ingredientId: ids.ingredients.creamCheese, qtyPerBatch: D("0.9") },
      { ingredientId: ids.ingredients.sugar, qtyPerBatch: D("0.2") },
      { ingredientId: ids.ingredients.egg, qtyPerBatch: D("3") },
      { ingredientId: ids.ingredients.matcha, qtyPerBatch: D("0.03") }
    ],
    changedAt: daysAgo(2),
    changedBy: "admin@example.com",
    changeType: "CREATE"
  },
  {
    _id: O("66f100000000000000000455"),
    recipeId: ids.recipes.tiramisu,
    productId: ids.products.tiramisu,
    version: 1,
    yieldQty: D("6"),
    items: [
      { ingredientId: ids.ingredients.creamCheese, qtyPerBatch: D("0.8") },
      { ingredientId: ids.ingredients.kahlua, qtyPerBatch: D("0.08") }
    ],
    changedAt: daysAgo(2),
    changedBy: "superadmin@123.com",
    changeType: "CREATE"
  }
]);

appDb.bake_records.insertMany([
  {
    _id: ids.bakes.croissant,
    idempotencyKey: "seed-bake-croissant-001",
    recipeId: ids.recipes.croissant,
    productId: ids.products.croissant,
    recipeVersion: 2,
    customOverride: false,
    appliedItems: [
      { ingredientId: ids.ingredients.flour, ingredientName: "Bot mi", unit: "kg", qtyPerBatch: D("0.8") },
      { ingredientId: ids.ingredients.butter, ingredientName: "Bo lat", unit: "kg", qtyPerBatch: D("0.35") },
      { ingredientId: ids.ingredients.milk, ingredientName: "Sua tuoi", unit: "l", qtyPerBatch: D("0.5") }
    ],
    factor: D("1.75"),
    producedQty: D("35"),
    totalIngredientCost: D("612500"),
    producedUnitCost: D("17500"),
    deductions: [
      { ingredientId: ids.ingredients.flour, ingredientName: "Bot mi", unit: "kg", qty: D("1.4"), cost: D("41000"), lotAllocations: [{ lotCode: "LOT-BMI-240101", qty: D("1"), unitCost: D("28000") }, { lotCode: "LOT-BMI-240212", qty: D("0.4"), unitCost: D("30000") }] },
      { ingredientId: ids.ingredients.butter, ingredientName: "Bo lat", unit: "kg", qty: D("0.6125"), cost: D("109250"), lotAllocations: [{ lotCode: "LOT-BLT-240228", qty: D("0.6125"), unitCost: D("182000") }] },
      { ingredientId: ids.ingredients.milk, ingredientName: "Sua tuoi", unit: "l", qty: D("0.875"), cost: D("26250"), lotAllocations: [{ lotCode: "LOT-STU-240305", qty: D("0.875"), unitCost: D("30000") }] }
    ],
    createdAt: daysAgo(6),
    createdBy: "admin@example.com"
  },
  {
    _id: ids.bakes.cookie,
    idempotencyKey: "seed-bake-cookie-001",
    recipeId: ids.recipes.cookie,
    productId: ids.products.cookie,
    recipeVersion: 1,
    customOverride: true,
    appliedItems: [
      { ingredientId: ids.ingredients.flour, ingredientName: "Bot mi", unit: "kg", qtyPerBatch: D("0.55") },
      { ingredientId: ids.ingredients.sugar, ingredientName: "Duong cat", unit: "kg", qtyPerBatch: D("0.25") },
      { ingredientId: ids.ingredients.choco, ingredientName: "Chocolate chip", unit: "kg", qtyPerBatch: D("0.35") }
    ],
    factor: D("1"),
    producedQty: D("30"),
    totalIngredientCost: D("702500"),
    producedUnitCost: D("23416.666667"),
    deductions: [
      { ingredientId: ids.ingredients.flour, ingredientName: "Bot mi", unit: "kg", qty: D("0.55"), cost: D("16500"), lotAllocations: [{ lotCode: "LOT-BMI-240212", qty: D("0.55"), unitCost: D("30000") }] },
      { ingredientId: ids.ingredients.sugar, ingredientName: "Duong cat", unit: "kg", qty: D("0.25"), cost: D("6375"), lotAllocations: [{ lotCode: "LOT-DCA-240220", qty: D("0.25"), unitCost: D("25500") }] },
      { ingredientId: ids.ingredients.choco, ingredientName: "Chocolate chip", unit: "kg", qty: D("0.35"), cost: D("82250"), lotAllocations: [{ lotCode: "LOT-CCP-240306", qty: D("0.35"), unitCost: D("235000") }] }
    ],
    createdAt: daysAgo(4),
    createdBy: "superadmin@123.com"
  },
  {
    _id: ids.bakes.cheesecake,
    idempotencyKey: "seed-bake-cheesecake-001",
    recipeId: ids.recipes.cheesecake,
    productId: ids.products.cheesecake,
    recipeVersion: 1,
    customOverride: false,
    appliedItems: [
      { ingredientId: ids.ingredients.creamCheese, ingredientName: "Pho mai kem", unit: "kg", qtyPerBatch: D("0.9") },
      { ingredientId: ids.ingredients.matcha, ingredientName: "Bot matcha", unit: "kg", qtyPerBatch: D("0.03") }
    ],
    factor: D("1"),
    producedQty: D("8"),
    totalIngredientCost: D("294000"),
    producedUnitCost: D("36750"),
    deductions: [
      { ingredientId: ids.ingredients.creamCheese, ingredientName: "Pho mai kem", unit: "kg", qty: D("0.9"), cost: D("252000"), lotAllocations: [{ lotCode: "LOT-PMK-240312", qty: D("0.9"), unitCost: D("280000") }] },
      { ingredientId: ids.ingredients.matcha, ingredientName: "Bot matcha", unit: "kg", qty: D("0.03"), cost: D("21600"), lotAllocations: [{ lotCode: "LOT-MAT-240310", qty: D("0.03"), unitCost: D("720000") }] }
    ],
    createdAt: daysAgo(2),
    createdBy: "admin@example.com"
  },
  {
    _id: ids.bakes.tiramisu,
    idempotencyKey: "seed-bake-tiramisu-001",
    recipeId: ids.recipes.tiramisu,
    productId: ids.products.tiramisu,
    recipeVersion: 1,
    customOverride: false,
    appliedItems: [
      { ingredientId: ids.ingredients.creamCheese, ingredientName: "Pho mai kem", unit: "kg", qtyPerBatch: D("0.8") },
      { ingredientId: ids.ingredients.kahlua, ingredientName: "Kahlua", unit: "l", qtyPerBatch: D("0.08") }
    ],
    factor: D("1"),
    producedQty: D("6"),
    totalIngredientCost: D("272000"),
    producedUnitCost: D("45333.333333"),
    deductions: [
      { ingredientId: ids.ingredients.creamCheese, ingredientName: "Pho mai kem", unit: "kg", qty: D("0.8"), cost: D("224000"), lotAllocations: [{ lotCode: "LOT-PMK-240312", qty: D("0.8"), unitCost: D("280000") }] },
      { ingredientId: ids.ingredients.kahlua, ingredientName: "Kahlua", unit: "l", qty: D("0.08"), cost: D("36000"), lotAllocations: [{ lotCode: "LOT-KAH-240314", qty: D("0.08"), unitCost: D("450000") }] }
    ],
    createdAt: daysAgo(1),
    createdBy: "superadmin@123.com"
  }
]);

appDb.product_lots.insertMany([
  {
    _id: O("66f100000000000000000601"),
    productId: ids.products.croissant,
    lotCode: "LOT-CROI-240320-A",
    bakeRecordId: ids.bakes.croissant,
    recipeVersion: 2,
    producedQty: D("30"),
    remainingQty: D("18"),
    unitCost: D("17000"),
    totalCost: D("510000"),
    producedAt: daysAgo(7),
    note: "Bake lot A",
    createdAt: daysAgo(7),
    updatedAt: daysAgo(2)
  },
  {
    _id: O("66f100000000000000000602"),
    productId: ids.products.croissant,
    lotCode: "LOT-CROI-240325-B",
    bakeRecordId: ids.bakes.croissant,
    recipeVersion: 2,
    producedQty: D("35"),
    remainingQty: D("27"),
    unitCost: D("18500"),
    totalCost: D("647500"),
    producedAt: daysAgo(2),
    note: "Bake lot B",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1)
  },
  {
    _id: O("66f100000000000000000603"),
    productId: ids.products.cookie,
    lotCode: "LOT-COOK-240320-A",
    bakeRecordId: ids.bakes.cookie,
    recipeVersion: 1,
    producedQty: D("20"),
    remainingQty: D("12"),
    unitCost: D("28500"),
    totalCost: D("570000"),
    producedAt: daysAgo(6),
    note: "Cookie lot A",
    createdAt: daysAgo(6),
    updatedAt: daysAgo(2)
  },
  {
    _id: O("66f100000000000000000604"),
    productId: ids.products.cookie,
    lotCode: "LOT-COOK-240325-B",
    bakeRecordId: ids.bakes.cookie,
    recipeVersion: 1,
    producedQty: D("20"),
    remainingQty: D("10"),
    unitCost: D("29500"),
    totalCost: D("590000"),
    producedAt: daysAgo(2),
    note: "Cookie lot B",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1)
  },
  {
    _id: O("66f100000000000000000605"),
    productId: ids.products.cheesecake,
    lotCode: "LOT-CHSC-240324-A",
    bakeRecordId: ids.bakes.cheesecake,
    recipeVersion: 1,
    producedQty: D("8"),
    remainingQty: D("8"),
    unitCost: D("68000"),
    totalCost: D("544000"),
    producedAt: daysAgo(2),
    note: "Cheesecake lot",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1)
  },
  {
    _id: O("66f100000000000000000606"),
    productId: ids.products.tiramisu,
    lotCode: "LOT-TIRA-240325-A",
    bakeRecordId: ids.bakes.tiramisu,
    recipeVersion: 1,
    producedQty: D("6"),
    remainingQty: D("6"),
    unitCost: D("70000"),
    totalCost: D("420000"),
    producedAt: daysAgo(1),
    note: "Tiramisu lot",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1)
  },
  {
    _id: O("66f100000000000000000607"),
    productId: ids.products.sourdough,
    lotCode: "LOT-SOUR-240325-A",
    bakeRecordId: null,
    recipeVersion: 1,
    producedQty: D("12"),
    remainingQty: D("12"),
    unitCost: D("21000"),
    totalCost: D("252000"),
    producedAt: daysAgo(1),
    note: "Initial lot",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1)
  },
  {
    _id: O("66f100000000000000000608"),
    productId: ids.products.brownie,
    lotCode: "LOT-BROW-240320-X",
    bakeRecordId: null,
    recipeVersion: 1,
    producedQty: D("12"),
    remainingQty: D("0"),
    unitCost: D("45000"),
    totalCost: D("540000"),
    producedAt: daysAgo(6),
    note: "Brownie lot sold out",
    createdAt: daysAgo(6),
    updatedAt: daysAgo(1)
  }
]);

appDb.product_stock_logs.insertMany([
  { _id: O("66f100000000000000000651"), productId: ids.products.croissant, type: "IN", qty: D("35"), note: "Production bake", relatedOrderId: null, createdAt: daysAgo(2), createdBy: "admin@example.com" },
  { _id: O("66f100000000000000000652"), productId: ids.products.cookie, type: "IN", qty: D("20"), note: "Production bake", relatedOrderId: null, createdAt: daysAgo(2), createdBy: "superadmin@123.com" },
  { _id: O("66f100000000000000000653"), productId: ids.products.croissant, type: "OUT", qty: D("2"), note: "Order placed reserve", relatedOrderId: ids.orders.newGuest, createdAt: daysAgo(0, 10), createdBy: "system" },
  { _id: O("66f100000000000000000654"), productId: ids.products.cookie, type: "OUT", qty: D("3"), note: "Order placed reserve", relatedOrderId: ids.orders.confirmed, createdAt: daysAgo(0, 9), createdBy: "system" },
  { _id: O("66f100000000000000000655"), productId: ids.products.croissant, type: "RESTORE", qty: D("4"), note: "Order cancelled restore", relatedOrderId: ids.orders.cancelled, createdAt: daysAgo(0, 3), createdBy: "admin@example.com" }
]);

appDb.orders.insertMany([
  {
    _id: ids.orders.newGuest,
    userId: null,
    items: [
      {
        productId: ids.products.croissant,
        name: "Croissant Bo",
        price: D("35000"),
        qty: D("2"),
        cost: D("37000"),
        lotAllocations: [
          { lotCode: "LOT-CROI-240325-B", qty: D("2"), unitCost: D("18500"), subtotalCost: D("37000"), producedAt: daysAgo(2), reference: "Order reserve" }
        ]
      }
    ],
    status: "NEW",
    recipientName: "Nguyen Minh Thu",
    recipientPhone: "0901234567",
    deliveryAddress: "123 Le Loi, Quan 1, TP.HCM",
    deliveryDate: "2026-03-27",
    deliveryTime: "15:30",
    paymentMethod: "COD_DEPOSIT",
    note: "Goi ky hop qua giup minh",
    idempotencyKey: "seed-order-new-001",
    holdExpiresAt: minutesFromNow(22),
    cancelReason: null,
    subtotal: D("70000"),
    tax: D("0"),
    total: D("70000"),
    stockDeducted: true,
    createdAt: daysAgo(0, 8),
    updatedAt: daysAgo(0, 8)
  },
  {
    _id: ids.orders.confirmed,
    userId: ids.users.customerA,
    items: [
      {
        productId: ids.products.cookie,
        name: "Cookie Cha Bong",
        price: D("55000"),
        qty: D("3"),
        cost: D("87000"),
        lotAllocations: [
          { lotCode: "LOT-COOK-240325-B", qty: D("3"), unitCost: D("29000"), subtotalCost: D("87000"), producedAt: daysAgo(2), reference: "Order reserve" }
        ]
      }
    ],
    status: "CONFIRMED",
    recipientName: "Tran Quynh Anh",
    recipientPhone: "0911222333",
    deliveryAddress: "45 Nguyen Hue, Quan 1, TP.HCM",
    deliveryDate: "2026-03-27",
    deliveryTime: "10:00",
    paymentMethod: "BANK_TRANSFER",
    note: "",
    idempotencyKey: "seed-order-confirmed-001",
    holdExpiresAt: minutesFromNow(10),
    cancelReason: null,
    subtotal: D("165000"),
    tax: D("0"),
    total: D("165000"),
    stockDeducted: true,
    createdAt: daysAgo(0, 7),
    updatedAt: daysAgo(0, 6)
  },
  {
    _id: ids.orders.paid,
    userId: ids.users.customerB,
    items: [
      {
        productId: ids.products.cheesecake,
        name: "Matcha Cheesecake",
        price: D("120000"),
        qty: D("1"),
        cost: D("68000"),
        lotAllocations: [
          { lotCode: "LOT-CHSC-240324-A", qty: D("1"), unitCost: D("68000"), subtotalCost: D("68000"), producedAt: daysAgo(2), reference: "Order reserve" }
        ]
      }
    ],
    status: "PAID",
    recipientName: "Le Dang Khoa",
    recipientPhone: "0933444555",
    deliveryAddress: "88 Cach Mang Thang 8, Quan 3, TP.HCM",
    deliveryDate: "2026-03-26",
    deliveryTime: "18:00",
    paymentMethod: "BANK_TRANSFER",
    note: "Vui long goi truoc 10 phut",
    idempotencyKey: "seed-order-paid-001",
    holdExpiresAt: minutesFromNow(5),
    cancelReason: null,
    subtotal: D("120000"),
    tax: D("0"),
    total: D("120000"),
    stockDeducted: true,
    createdAt: daysAgo(0, 5),
    updatedAt: daysAgo(0, 4)
  },
  {
    _id: ids.orders.completed,
    userId: ids.users.customerA,
    items: [
      {
        productId: ids.products.tiramisu,
        name: "Tiramisu Kahlua",
        price: D("130000"),
        qty: D("2"),
        cost: D("140000"),
        lotAllocations: [
          { lotCode: "LOT-TIRA-240325-A", qty: D("2"), unitCost: D("70000"), subtotalCost: D("140000"), producedAt: daysAgo(1), reference: "Order reserve" }
        ]
      }
    ],
    status: "COMPLETED",
    recipientName: "Pham Gia Han",
    recipientPhone: "0987665544",
    deliveryAddress: "9 Vo Van Tan, Quan 3, TP.HCM",
    deliveryDate: "2026-03-25",
    deliveryTime: "14:00",
    paymentMethod: "COD_DEPOSIT",
    note: "Khach da nhan hang",
    idempotencyKey: "seed-order-completed-001",
    holdExpiresAt: daysAgo(1),
    cancelReason: null,
    subtotal: D("260000"),
    tax: D("0"),
    total: D("260000"),
    stockDeducted: true,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(0, 20)
  },
  {
    _id: ids.orders.cancelled,
    userId: null,
    items: [
      {
        productId: ids.products.croissant,
        name: "Croissant Bo",
        price: D("35000"),
        qty: D("4"),
        cost: D("74000"),
        lotAllocations: [
          { lotCode: "LOT-CROI-240325-B", qty: D("4"), unitCost: D("18500"), subtotalCost: D("74000"), producedAt: daysAgo(2), reference: "Order reserve" }
        ]
      }
    ],
    status: "CANCELLED",
    recipientName: "Vo Thanh Long",
    recipientPhone: "0977333222",
    deliveryAddress: "15 Phan Xich Long, Phu Nhuan, TP.HCM",
    deliveryDate: "2026-03-26",
    deliveryTime: "11:30",
    paymentMethod: "COD_DEPOSIT",
    note: "Khach doi lich giao",
    idempotencyKey: "seed-order-cancelled-001",
    holdExpiresAt: daysAgo(0, 2),
    cancelReason: "Khach doi lich nhan banh",
    subtotal: D("140000"),
    tax: D("0"),
    total: D("140000"),
    stockDeducted: false,
    createdAt: daysAgo(0, 4),
    updatedAt: daysAgo(0, 3)
  },
  {
    _id: ids.orders.newCustomer,
    userId: ids.users.customerB,
    items: [
      {
        productId: ids.products.croissant,
        name: "Croissant Bo",
        price: D("35000"),
        qty: D("1"),
        cost: D("18500"),
        lotAllocations: [
          { lotCode: "LOT-CROI-240325-B", qty: D("1"), unitCost: D("18500"), subtotalCost: D("18500"), producedAt: daysAgo(2), reference: "Order reserve" }
        ]
      },
      {
        productId: ids.products.cookie,
        name: "Cookie Cha Bong",
        price: D("55000"),
        qty: D("1"),
        cost: D("29000"),
        lotAllocations: [
          { lotCode: "LOT-COOK-240325-B", qty: D("1"), unitCost: D("29000"), subtotalCost: D("29000"), producedAt: daysAgo(2), reference: "Order reserve" }
        ]
      }
    ],
    status: "NEW",
    recipientName: "Dang Minh Duc",
    recipientPhone: "0909090909",
    deliveryAddress: "220 Tran Hung Dao, Quan 5, TP.HCM",
    deliveryDate: "2026-03-27",
    deliveryTime: "09:00",
    paymentMethod: "BANK_TRANSFER",
    note: "Giao trong gio hanh chinh",
    idempotencyKey: "seed-order-new-002",
    holdExpiresAt: minutesFromNow(28),
    cancelReason: null,
    subtotal: D("90000"),
    tax: D("0"),
    total: D("90000"),
    stockDeducted: true,
    createdAt: daysAgo(0, 2),
    updatedAt: daysAgo(0, 2)
  }
]);

appDb.audit_logs.insertMany([
  {
    _id: O("66f100000000000000000801"),
    title: "Created ingredient Bot mi",
    module: "INGREDIENT",
    action: "CREATE",
    entityId: String(ids.ingredients.flour),
    actorId: String(ids.users.superadmin),
    actorEmail: "superadmin@123.com",
    beforeData: null,
    afterData: { name: "Bot mi", ingredientCode: "D0001", unit: "kg" },
    metadata: { unit: "kg", ingredientCode: "D0001" },
    createdAt: daysAgo(120)
  },
  {
    _id: O("66f100000000000000000802"),
    title: "Adjusted stock for ingredient Bot mi",
    module: "INGREDIENT",
    action: "STOCK_ADJUST",
    entityId: String(ids.ingredients.flour),
    actorId: String(ids.users.admin),
    actorEmail: "admin@example.com",
    beforeData: null,
    afterData: { currentStock: "12.5", ingredientName: "Bot mi" },
    metadata: { type: "IN", qtyBase: "12", note: "Nhap kho bo sung" },
    createdAt: daysAgo(42)
  },
  {
    _id: O("66f100000000000000000803"),
    title: "Created category Banh kem",
    module: "CATEGORY",
    action: "CREATE",
    entityId: String(ids.categories.cake),
    actorId: String(ids.users.superadmin),
    actorEmail: "superadmin@123.com",
    beforeData: null,
    afterData: { name: "Banh kem", sku: "CAKES-00001" },
    metadata: {},
    createdAt: daysAgo(90)
  },
  {
    _id: O("66f100000000000000000804"),
    title: "Created product Croissant Bo",
    module: "PRODUCT",
    action: "CREATE",
    entityId: String(ids.products.croissant),
    actorId: String(ids.users.admin),
    actorEmail: "admin@example.com",
    beforeData: null,
    afterData: { name: "Croissant Bo", sku: "PASTR-00011", category: "Banh ngan lop" },
    metadata: { active: true },
    createdAt: daysAgo(90)
  },
  {
    _id: O("66f100000000000000000805"),
    title: "Updated recipe for Croissant Bo",
    module: "RECIPE",
    action: "UPDATE",
    entityId: String(ids.recipes.croissant),
    actorId: String(ids.users.superadmin),
    actorEmail: "superadmin@123.com",
    beforeData: { version: 1 },
    afterData: { version: 2 },
    metadata: { changedItems: 2 },
    createdAt: daysAgo(3)
  },
  {
    _id: O("66f100000000000000000806"),
    title: "Produced 35 of Croissant Bo",
    module: "PRODUCTION",
    action: "PRODUCE",
    entityId: String(ids.bakes.croissant),
    actorId: String(ids.users.admin),
    actorEmail: "admin@example.com",
    beforeData: null,
    afterData: { producedQty: "35", recipeVersion: 2 },
    metadata: { totalIngredientCost: "612500", producedUnitCost: "17500" },
    createdAt: daysAgo(2)
  },
  {
    _id: O("66f100000000000000000807"),
    title: "Created order for Nguyen Minh Thu (Croissant Bo)",
    module: "ORDER",
    action: "CREATE",
    entityId: String(ids.orders.newGuest),
    actorId: null,
    actorEmail: "guest",
    beforeData: null,
    afterData: { status: "NEW", recipientName: "Nguyen Minh Thu" },
    metadata: { stockReserved: true },
    createdAt: daysAgo(0, 8)
  },
  {
    _id: O("66f100000000000000000808"),
    title: "Order moved NEW -> CONFIRMED",
    module: "ORDER",
    action: "STATUS_CHANGE",
    entityId: String(ids.orders.confirmed),
    actorId: String(ids.users.admin),
    actorEmail: "admin@example.com",
    beforeData: { status: "NEW" },
    afterData: { status: "CONFIRMED" },
    metadata: { reason: "" },
    createdAt: daysAgo(0, 6)
  },
  {
    _id: O("66f100000000000000000809"),
    title: "Order moved CONFIRMED -> PAID",
    module: "ORDER",
    action: "STATUS_CHANGE",
    entityId: String(ids.orders.paid),
    actorId: String(ids.users.admin),
    actorEmail: "admin@example.com",
    beforeData: { status: "CONFIRMED" },
    afterData: { status: "PAID" },
    metadata: {},
    createdAt: daysAgo(0, 4)
  },
  {
    _id: O("66f10000000000000000080a"),
    title: "Order moved PAID -> COMPLETED",
    module: "ORDER",
    action: "STATUS_CHANGE",
    entityId: String(ids.orders.completed),
    actorId: String(ids.users.admin),
    actorEmail: "admin@example.com",
    beforeData: { status: "PAID" },
    afterData: { status: "COMPLETED" },
    metadata: {},
    createdAt: daysAgo(0, 1)
  },
  {
    _id: O("66f10000000000000000080b"),
    title: "Order cancelled and stock restored",
    module: "ORDER",
    action: "STATUS_CHANGE",
    entityId: String(ids.orders.cancelled),
    actorId: String(ids.users.admin),
    actorEmail: "admin@example.com",
    beforeData: { status: "NEW" },
    afterData: { status: "CANCELLED" },
    metadata: { cancelReason: "Khach doi lich nhan banh", stockRestored: true },
    createdAt: daysAgo(0, 3)
  },
  {
    _id: O("66f10000000000000000080c"),
    title: "Created user Admin Staff",
    module: "USER",
    action: "CREATE",
    entityId: String(ids.users.admin),
    actorId: String(ids.users.superadmin),
    actorEmail: "superadmin@123.com",
    beforeData: null,
    afterData: { email: "admin@example.com", fullName: "Admin Staff", roles: ["ADMIN"] },
    metadata: {},
    createdAt: daysAgo(60)
  }
]);

// Keep compatibility with service layer: all reference fields are stored as String, not ObjectId.
appDb.ingredient_stock_transactions.updateMany({}, [
  {
    $set: {
      ingredientId: { $toString: "$ingredientId" }
    }
  }
]);

appDb.recipes.updateMany({}, [
  {
    $set: {
      productId: { $toString: "$productId" },
      items: {
        $map: {
          input: "$items",
          as: "item",
          in: {
            ingredientId: { $toString: "$$item.ingredientId" },
            qtyPerBatch: "$$item.qtyPerBatch"
          }
        }
      }
    }
  }
]);

appDb.recipe_revisions.updateMany({}, [
  {
    $set: {
      recipeId: { $toString: "$recipeId" },
      productId: { $toString: "$productId" },
      items: {
        $map: {
          input: "$items",
          as: "item",
          in: {
            ingredientId: { $toString: "$$item.ingredientId" },
            qtyPerBatch: "$$item.qtyPerBatch"
          }
        }
      }
    }
  }
]);

appDb.bake_records.updateMany({}, [
  {
    $set: {
      recipeId: { $toString: "$recipeId" },
      productId: { $toString: "$productId" },
      appliedItems: {
        $map: {
          input: "$appliedItems",
          as: "item",
          in: {
            ingredientId: { $toString: "$$item.ingredientId" },
            ingredientName: "$$item.ingredientName",
            unit: "$$item.unit",
            qtyPerBatch: "$$item.qtyPerBatch"
          }
        }
      },
      deductions: {
        $map: {
          input: "$deductions",
          as: "deduction",
          in: {
            ingredientId: { $toString: "$$deduction.ingredientId" },
            ingredientName: "$$deduction.ingredientName",
            unit: "$$deduction.unit",
            qty: "$$deduction.qty",
            cost: "$$deduction.cost",
            lotAllocations: "$$deduction.lotAllocations"
          }
        }
      }
    }
  }
]);

appDb.product_lots.updateMany({}, [
  {
    $set: {
      productId: { $toString: "$productId" },
      bakeRecordId: {
        $cond: [{ $eq: ["$bakeRecordId", null] }, null, { $toString: "$bakeRecordId" }]
      }
    }
  }
]);

appDb.product_stock_logs.updateMany({}, [
  {
    $set: {
      productId: { $toString: "$productId" },
      relatedOrderId: {
        $cond: [{ $eq: ["$relatedOrderId", null] }, null, { $toString: "$relatedOrderId" }]
      }
    }
  }
]);

appDb.orders.updateMany({}, [
  {
    $set: {
      userId: {
        $cond: [{ $eq: ["$userId", null] }, null, { $toString: "$userId" }]
      },
      items: {
        $map: {
          input: "$items",
          as: "item",
          in: {
            productId: { $toString: "$$item.productId" },
            name: "$$item.name",
            price: "$$item.price",
            qty: "$$item.qty",
            cost: "$$item.cost",
            lotAllocations: "$$item.lotAllocations"
          }
        }
      }
    }
  }
]);

const summary = {};
collections.forEach(name => {
  summary[name] = appDb.getCollection(name).countDocuments();
});

print("Seed mock data completed for database:", dbName);
printjson(summary);
