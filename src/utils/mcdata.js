import minecraftData from 'minecraft-data';
import settings from '../agent/settings.js';
import { createBot } from 'mineflayer';
import prismarine_items from 'prismarine-item';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import plugin from 'mineflayer-armor-manager';
const armorManager = plugin;
let mc_version = settings.minecraft_version;
let mcdata = null;
let Item = null;
// mcdata = minecraftData("1.21.1")
/**
 * @typedef {string} ItemName
 * @typedef {string} BlockName
*/
const TOOL_TIERS = ['netherite', 'diamond', 'iron', 'gold', 'stone', 'wooden'];
export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
export const MATCHING_WOOD_BLOCKS = [
    'log',
    'planks',
    'sign',
    'boat',
    'fence_gate',
    'door',
    'fence',
    'slab',
    'stairs',
    'button',
    'pressure_plate',
    'trapdoor'
]
export const WOOL_COLORS = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
]


export function initBot(username) {
    const options = {
        username: username,
        host: settings.host,
        port: settings.port,
        auth: settings.auth,
        version: mc_version,
    }
    if (!mc_version || mc_version === "auto") {
        delete options.version;
    }

    const bot = createBot(options);
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectblock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(armorManager); // auto equip armor
    bot.once('resourcePack', () => {
        bot.acceptResourcePack();
    });

    bot.once('login', () => {
        mc_version = bot.version;
        mcdata = minecraftData(mc_version);
        Item = prismarine_items(mc_version);
    });

    return bot;
}

export function isHuntable(mob) {
    if (!mob || !mob.name) return false;
    const animals = ['chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'];
    return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16]; // metadata 16 is not baby
}

export function isHostile(mob) {
    if (!mob || !mob.name) return false;
    return  (mob.type === 'mob' || mob.type === 'hostile') && mob.name !== 'iron_golem' && mob.name !== 'snow_golem';
}

// blocks that don't work with collectBlock, need to be manually collected
export function mustCollectManually(blockName) {
    // all crops (that aren't normal blocks), torches, buttons, levers, redstone,
    const full_names = ['wheat', 'carrots', 'potatoes', 'beetroots', 'nether_wart', 'cocoa', 'sugar_cane', 'kelp', 'short_grass', 'fern', 'tall_grass', 'bamboo',
        'poppy', 'dandelion', 'blue_orchid', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'lilac', 'wither_rose', 'lily_of_the_valley', 'wither_rose',
        'lever', 'redstone_wire', 'lantern']
    const partial_names = ['sapling', 'torch', 'button', 'carpet', 'pressure_plate', 'mushroom', 'tulip', 'bush', 'vines', 'fern']
    return full_names.includes(blockName.toLowerCase()) || partial_names.some(partial => blockName.toLowerCase().includes(partial));
}

export function getItemId(itemName) {
    let item = mcdata.itemsByName[itemName];
    if (item) {
        return item.id;
    }
    return null;
}

export function getItemName(itemId) {
    let item = mcdata.items[itemId]
    if (item) {
        return item.name;
    }
    return null;
}

export function getBlockId(blockName) {
    let block = mcdata.blocksByName[blockName];
    if (block) {
        return block.id;
    }
    return null;
}

export function getBlockName(blockId) {
    let block = mcdata.blocks[blockId]
    if (block) {
        return block.name;
    }
    return null;
}

export function getEntityId(entityName) {
    let entity = mcdata.entitiesByName[entityName];
    if (entity) {
        return entity.id;
    }
    return null;
}

export function getAllItems(ignore) {
    if (!ignore) {
        ignore = [];
    }
    let items = []
    for (const itemId in mcdata.items) {
        const item = mcdata.items[itemId];
        if (!ignore.includes(item.name)) {
            items.push(item);
        }
    }
    return items;
}

export function getAllItemIds(ignore) {
    const items = getAllItems(ignore);
    let itemIds = [];
    for (const item of items) {
        itemIds.push(item.id);
    }
    return itemIds;
}

export function getAllBlocks(ignore) {
    if (!ignore) {
        ignore = [];
    }
    let blocks = []
    for (const blockId in mcdata.blocks) {
        const block = mcdata.blocks[blockId];
        if (!ignore.includes(block.name)) {
            blocks.push(block);
        }
    }
    return blocks;
}

export function getAllBlockIds(ignore) {
    const blocks = getAllBlocks(ignore);
    let blockIds = [];
    for (const block of blocks) {
        blockIds.push(block.id);
    }
    return blockIds;
}

export function getAllBiomes() {
    return mcdata.biomes;
}

export function getItemCraftingRecipes(itemName) {
    let itemId = getItemId(itemName);
    if (!mcdata.recipes[itemId]) {
        return null;
    }

    let recipes = [];
    for (let r of mcdata.recipes[itemId]) {
        let recipe = {};
        let ingredients = [];
        if (r.ingredients) {
            ingredients = r.ingredients;
        } else if (r.inShape) {
            ingredients = r.inShape.flat();
        }
        for (let ingredient of ingredients) {
            let ingredientName = getItemName(ingredient);
            if (ingredientName === null) continue;
            if (!recipe[ingredientName])
                recipe[ingredientName] = 0;
            recipe[ingredientName]++;
        }
        recipes.push([
            recipe,
            {craftedCount : r.result.count}
        ]);
    }
    // sort recipes by if their ingredients include common items
    const commonItems = ['oak_planks', 'oak_log', 'coal', 'cobblestone'];
    recipes.sort((a, b) => {
        let commonCountA = Object.keys(a[0]).filter(key => commonItems.includes(key)).reduce((acc, key) => acc + a[0][key], 0);
        let commonCountB = Object.keys(b[0]).filter(key => commonItems.includes(key)).reduce((acc, key) => acc + b[0][key], 0);
        return commonCountB - commonCountA;
    });

    return recipes;
}

export function isSmeltable(itemName) {
    const misc_smeltables = ['beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit', 'salmon', 'tropical_fish', 'potato', 'kelp', 'sand', 'cobblestone', 'clay_ball'];
    return itemName.includes('raw') || itemName.includes('log') || misc_smeltables.includes(itemName);
}

export function getSmeltingFuel(bot) {
    let fuel = bot.inventory.items().find(i => i.name === 'coal' || i.name === 'charcoal' || i.name === 'blaze_rod')
    if (fuel)
        return fuel;
    fuel = bot.inventory.items().find(i => i.name.includes('log') || i.name.includes('planks'))
    if (fuel)
        return fuel;
    return bot.inventory.items().find(i => i.name === 'coal_block' || i.name === 'lava_bucket');
}

export function getFuelSmeltOutput(fuelName) {
    if (fuelName === 'coal' || fuelName === 'charcoal')
        return 8;
    if (fuelName === 'blaze_rod')
        return 12;
    if (fuelName.includes('log') || fuelName.includes('planks'))
        return 1.5
    if (fuelName === 'coal_block')
        return 80;
    if (fuelName === 'lava_bucket')
        return 100;
    return 0;
}

export function getItemSmeltingIngredient(itemName) {
    return {    
        baked_potato: 'potato',
        steak: 'raw_beef',
        cooked_chicken: 'raw_chicken',
        cooked_cod: 'raw_cod',
        cooked_mutton: 'raw_mutton',
        cooked_porkchop: 'raw_porkchop',
        cooked_rabbit: 'raw_rabbit',
        cooked_salmon: 'raw_salmon',
        dried_kelp: 'kelp',
        iron_ingot: 'raw_iron',
        gold_ingot: 'raw_gold',
        copper_ingot: 'raw_copper',
        glass: 'sand'
    }[itemName];
}

export function getItemBlockSources(itemName) {
    let itemId = getItemId(itemName);
    let sources = [];
    for (let block of getAllBlocks()) {
        if (block.drops.includes(itemId)) {
            sources.push(block.name);
        }
    }
    return sources;
}

export function getItemAnimalSource(itemName) {
    return {    
        raw_beef: 'cow',
        raw_chicken: 'chicken',
        raw_cod: 'cod',
        raw_mutton: 'sheep',
        raw_porkchop: 'pig',
        raw_rabbit: 'rabbit',
        raw_salmon: 'salmon',
        leather: 'cow',
        wool: 'sheep'
    }[itemName];
}

export function getBlockTool(blockName) {
    let block = mcdata.blocksByName[blockName];
    if (!block || !block.harvestTools) {
        return null;
    }
    return getItemName(Object.keys(block.harvestTools)[0]);  // Double check first tool is always simplest
}

export function makeItem(name, amount=1) {
    return new Item(getItemId(name), amount);
}

/**
 * Returns the number of ingredients required to use the recipe once.
 * 
 * @param {Recipe} recipe
 * @returns {Object<mc.ItemName, number>} an object describing the number of each ingredient.
 */
export function ingredientsFromPrismarineRecipe(recipe) {
    let requiredIngedients = {};
    if (recipe.inShape)
        for (const ingredient of recipe.inShape.flat()) {
            if(ingredient.id<0) continue; //prismarine-recipe uses id -1 as an empty crafting slot
            const ingredientName = getItemName(ingredient.id);
            requiredIngedients[ingredientName] ??=0;
            requiredIngedients[ingredientName] += ingredient.count;
        }
    if (recipe.ingredients)
        for (const ingredient of recipe.ingredients) {
            if(ingredient.id<0) continue;
            const ingredientName = getItemName(ingredient.id);
            requiredIngedients[ingredientName] ??=0;
            requiredIngedients[ingredientName] -= ingredient.count;
            //Yes, the `-=` is intended.
            //prismarine-recipe uses positive numbers for the shaped ingredients but negative for unshaped.
            //Why this is the case is beyond my understanding.
        }
    return requiredIngedients;
}

/**
 * Calculates the number of times an action, such as a crafing recipe, can be completed before running out of resources.
 * @template T - doesn't have to be an item. This could be any resource.
 * @param {Object.<T, number>} availableItems - The resources available; e.g, `{'cobble_stone': 7, 'stick': 10}`
 * @param {Object.<T, number>} requiredItems - The resources required to complete the action once; e.g, `{'cobble_stone': 3, 'stick': 2}`
 * @param {boolean} discrete - Is the action discrete?
 * @returns {{num: number, limitingResource: (T | null)}} the number of times the action can be completed and the limmiting resource; e.g `{num: 2, limitingResource: 'cobble_stone'}`
 */
export function calculateLimitingResource(availableItems, requiredItems, discrete=true) {
    let limitingResource = null;
    let num = Infinity;
    for (const itemType in requiredItems) {
        if (availableItems[itemType] < requiredItems[itemType] * num) {
            limitingResource = itemType;
            num = availableItems[itemType] / requiredItems[itemType];
        }
    }
    if(discrete) num = Math.floor(num);
    return {num, limitingResource}
}

let loopingItems = new Set();

export function initializeLoopingItems() {

    loopingItems = new Set(['coal',
        'wheat',
        'bone_meal',
        'diamond',
        'emerald',
        'raw_iron',
        'raw_gold',
        'redstone',
        'blue_wool',
        'packed_mud',
        'raw_copper',
        'iron_ingot',
        'dried_kelp',
        'gold_ingot',
        'slime_ball',
        'black_wool',
        'quartz_slab',
        'copper_ingot',
        'lapis_lazuli',
        'honey_bottle',
        'rib_armor_trim_smithing_template',
        'eye_armor_trim_smithing_template',
        'vex_armor_trim_smithing_template',
        'dune_armor_trim_smithing_template',
        'host_armor_trim_smithing_template',
        'tide_armor_trim_smithing_template',
        'wild_armor_trim_smithing_template',
        'ward_armor_trim_smithing_template',
        'coast_armor_trim_smithing_template',
        'spire_armor_trim_smithing_template',
        'snout_armor_trim_smithing_template',
        'shaper_armor_trim_smithing_template',
        'netherite_upgrade_smithing_template',
        'raiser_armor_trim_smithing_template',
        'sentry_armor_trim_smithing_template',
        'silence_armor_trim_smithing_template',
        'wayfinder_armor_trim_smithing_template']);
}


/**
 * Gets a detailed plan for crafting an item considering current inventory
 */
export function getDetailedCraftingPlan(targetItem, count = 1, current_inventory = {}) {
    initializeLoopingItems();
    if (!targetItem || count <= 0 || !getItemId(targetItem)) {
        return "Invalid input. Please provide a valid item name and positive count.";
    }

    if (isBaseItem(targetItem)) {
        const available = current_inventory[targetItem] || 0;
        if (available >= count) return "You have all required items already in your inventory!";
        return `${targetItem} is a base item, you need to find ${count - available} more in the world`;
    }

    const inventory = { ...current_inventory };
    const leftovers = {};
    const plan = craftItem(targetItem, count, inventory, leftovers);
    return formatPlan(targetItem, plan);
}

function isBaseItem(item) {
    return loopingItems.has(item) || getItemCraftingRecipes(item) === null;
}

function craftItem(item, count, inventory, leftovers, crafted = { required: {}, steps: [], leftovers: {} }) {
    // Check available inventory and leftovers first
    const availableInv = inventory[item] || 0;
    const availableLeft = leftovers[item] || 0;
    const totalAvailable = availableInv + availableLeft;

    if (totalAvailable >= count) {
        // Use leftovers first, then inventory
        const useFromLeft = Math.min(availableLeft, count);
        leftovers[item] = availableLeft - useFromLeft;
        
        const remainingNeeded = count - useFromLeft;
        if (remainingNeeded > 0) {
            inventory[item] = availableInv - remainingNeeded;
        }
        return crafted;
    }

    // Use whatever is available
    const stillNeeded = count - totalAvailable;
    if (availableLeft > 0) leftovers[item] = 0;
    if (availableInv > 0) inventory[item] = 0;

    if (isBaseItem(item)) {
        crafted.required[item] = (crafted.required[item] || 0) + stillNeeded;
        return crafted;
    }

    const recipe = getItemCraftingRecipes(item)?.[0];
    if (!recipe) {
        crafted.required[item] = stillNeeded;
        return crafted;
    }

    const [ingredients, result] = recipe;
    const craftedPerRecipe = result.craftedCount;
    const batchCount = Math.ceil(stillNeeded / craftedPerRecipe);
    const totalProduced = batchCount * craftedPerRecipe;

    // Add excess to leftovers
    if (totalProduced > stillNeeded) {
        leftovers[item] = (leftovers[item] || 0) + (totalProduced - stillNeeded);
    }

    // Process each ingredient
    for (const [ingredientName, ingredientCount] of Object.entries(ingredients)) {
        const totalIngredientNeeded = ingredientCount * batchCount;
        craftItem(ingredientName, totalIngredientNeeded, inventory, leftovers, crafted);
    }

    // Add crafting step
    const stepIngredients = Object.entries(ingredients)
        .map(([name, amount]) => `${amount * batchCount} ${name}`)
        .join(' + ');
    crafted.steps.push(`Craft ${stepIngredients} -> ${totalProduced} ${item}`);

    return crafted;
}

function formatPlan(targetItem, { required, steps, leftovers }) {
    const lines = [];

    if (Object.keys(required).length > 0) {
        lines.push('You are missing the following items:');
        Object.entries(required).forEach(([item, count]) => 
            lines.push(`- ${count} ${item}`));
        lines.push('\nOnce you have these items, here\'s your crafting plan:');
    } else {
        lines.push('You have all items required to craft this item!');
        lines.push('Here\'s your crafting plan:');
    }

    lines.push('');
    lines.push(...steps);

    if (Object.keys(required).some(item => item.includes('oak')) && !targetItem.includes('oak')) {
        lines.push('Note: Any varient of wood can be used for this recipe.');
    }

    if (Object.keys(leftovers).length > 0) {
        lines.push('\nYou will have leftover:');
        Object.entries(leftovers).forEach(([item, count]) => 
            lines.push(`- ${count} ${item}`));
    }

    return lines.join('\n');
}

export function requireTool(blockName) {
    const block = mcdata.blocksByName[blockName];

    // State 3: Not a valid block at all (e.g., an item like 'stone_pickaxe')
    if (!block) {
        return undefined; 
    }

    if (block.harvestTools && Object.keys(block.harvestTools).length > 0) {
        const toolIds = Object.keys(block.harvestTools);
        const toolNames = toolIds.map(id => mcdata.items[id]?.name).filter(Boolean);
        
        // State 1: Requires a specific tool
        return toolNames[0] || null; 
    } else {
        // State 2: It IS a block, but doesn't have harvestTools (can be mined by hand)
        return null;
    }
}

// Helper to get tier index (lower is better/stronger)
function getTier(toolName) {
    if (!toolName) return Infinity;
    const material = toolName.split('_')[0];
    const index = TOOL_TIERS.indexOf(material);
    return index === -1 ? Infinity : index;
}

function requiresCraftingTable(recipeData) {
    // Handle the case where an array of recipes is passed
    const recipes = Array.isArray(recipeData) ? recipeData : [recipeData];

    for (const recipe of recipes) {
        if (!recipe) continue;

        // 1. Check Shaped Recipes
        if (recipe.inShape) {
            const height = recipe.inShape.length;
            const width = recipe.inShape[0].length;
            if (height > 2 || width > 2) return true;
        }
        
        // 2. Check Shapeless Recipes
        // Note: In some mcData versions, this is 'ingredients', in others 'ingredients' is a list of IDs
        if (recipe.ingredients && recipe.ingredients.length > 4) {
            return true;
        }
    }

    return false;
}

export async function createPlan(targetItem, count = 1, current_inventory = {}) {
    initializeLoopingItems();
    
    if (!targetItem || count <= 0 || !getItemId(targetItem)) {
        return JSON.stringify({ error: "Invalid input. Please provide a valid item name and positive count." });
    }

    let step_count = 1;
    let steps = []; 
    let simulated_inventory = { ...current_inventory };
    const active_resolutions = new Set();

    // Helper to add and merge steps
    function addStep(stepData) {
        if (stepData.type === 'text') {
            steps.push(stepData);
            return;
        }

        for (let i = steps.length - 1; i >= 0; i--) {
            let existing = steps[i];
            if (existing.type === stepData.type && existing.item === stepData.item) {
                let canMerge = false;
                if (stepData.type === 'collect' && existing.targetBlock === stepData.targetBlock && existing.tool === stepData.tool) {
                    canMerge = true;
                } else if (stepData.type === 'craft' && existing.recipeId === stepData.recipeId) {
                    canMerge = true;
                } else if (stepData.type === 'smelt' && existing.ingredient === stepData.ingredient && existing.fuel === stepData.fuel) {
                    canMerge = true;
                } else if (stepData.type === 'hunt' && existing.source === stepData.source) {
                    canMerge = true;
                } else if (stepData.type === 'obtain') {
                    canMerge = true;
                }

                if (canMerge) {
                    existing.amount += stepData.amount;
                    if (stepData.type === 'craft') {
                        for (let newIng of stepData.ingredients) {
                            let exIng = existing.ingredients.find(i => i.name === newIng.name);
                            if (exIng) {
                                exIng.amount += newIng.amount;
                            } else {
                                existing.ingredients.push({ ...newIng });
                            }
                        }
                    } else if (stepData.type === 'smelt') {
                        existing.fuelAmount += stepData.fuelAmount;
                    }
                    return; 
                }
            }
        }
        steps.push(stepData);
    }

    function resolveFuel(itemsToSmelt) {
        const fuels = ['coal', 'charcoal', 'oak_log'];
        let chosenFuel = 'coal'; 
        for (const f of fuels) {
            if (simulated_inventory[f] > 0) { chosenFuel = f; break; }
        }
        const itemsPerFuel = getFuelSmeltOutput(chosenFuel) || 1;
        const fuelNeeded = Math.ceil(itemsToSmelt / itemsPerFuel);
        resolveItem(chosenFuel, fuelNeeded);
        simulated_inventory[chosenFuel] -= fuelNeeded;
        return { name: chosenFuel, amount: fuelNeeded };
    }

    function getWoodNote(itemName) {
        const genericWoodItems = [
            'stick', 'chest', 'crafting_table', 'barrel', 'composter', 'bowl', 
            'ladder', 'wooden_pickaxe', 'wooden_axe', 'wooden_sword', 
            'wooden_shovel', 'wooden_hoe', 'shield'
        ];
        if (genericWoodItems.includes(itemName)) {
            return " (Note: Any type of wood can be used)";
        }

        const woodTypes = ['dark_oak', 'oak', 'birch', 'spruce', 'jungle', 'acacia', 'mangrove', 'cherry', 'crimson', 'warped', 'bamboo'];
        const currentWood = woodTypes.find(w => itemName.includes(w));

        if (currentWood) {
            const isStrict = Array.from(active_resolutions).every(activeItem => activeItem.includes(currentWood));
            if (!isStrict) {
                return " (Note: Any type of wood can be used)";
            }
        }
        
        return "";
    }

    function getBestToolInInventory(requiredTool) {
        if (!requiredTool) return null;
        
        const toolType = requiredTool.split('_').slice(1).join('_'); 
        const requiredTier = getTier(requiredTool);

        let bestTool = null;
        let bestTier = Infinity;

        for (const [itemName, count] of Object.entries(simulated_inventory)) {
            if (count > 0 && itemName.endsWith(toolType)) {
                const currentTier = getTier(itemName);
                if (currentTier <= requiredTier && currentTier < bestTier) {
                    bestTier = currentTier;
                    bestTool = itemName;
                }
            }
        }
        return bestTool;
    }

    function getCustomObtainMethod(itemName) {
        const methods = {
            'milk_bucket': 'Use Bucket on Cow or Mooshroom',
            'water_bucket': 'Use Bucket on Water Source Block',
            'lava_bucket': 'Use Bucket on Lava Source Block',
            'powder_snow_bucket': 'Use Bucket on Powder Snow Block / Cauldron',
            'axolotl_bucket': 'Use Water Bucket on Axolotl',
            'cod_bucket': 'Use Water Bucket on Cod',
            'salmon_bucket': 'Use Water Bucket on Salmon',
            'tropical_fish_bucket': 'Use Water Bucket on Tropical Fish',
            'pufferfish_bucket': 'Use Water Bucket on Pufferfish',
            'honey_bottle': 'Use Bottle on Filled Beehive / Bee Nest (Level 5)',
            'dragon_breath': 'Use Bottle on Ender Dragon Breath Cloud ("Purple Fog")',
            'water_bottle': 'Use Bottle on Water Source / Cauldron',
            'potion': 'Use Bottle on Water Source / Cauldron',
            'mushroom_stew': 'Use Bowl on Red/Brown Mooshroom',
            'suspicious_stew': 'Feed Flower to Brown Mooshroom, then use Bowl',
            'honeycomb': 'Use Shears on Filled Beehive / Bee Nest (Level 5)',
            'zombie_head': 'Force a Charged Creeper to blow up a Zombie',
            'creeper_head': 'Force a Charged Creeper to blow up a Creeper',
            'skeleton_skull': 'Force a Charged Creeper to blow up a Skeleton',
            'piglin_head': 'Force a Charged Creeper to blow up a Piglin',
        };

        if (methods[itemName]) return methods[itemName];
        
        if (itemName.endsWith('_pottery_sherd')) {
            return 'Use Brush on Suspicious Sand / Gravel';
        }
        if (itemName.endsWith('_armor_trim_smithing_template')) {
            return 'Interaction with world containers (Trail Ruins / Vaults)';
        }

        return 'Check chests, mob drops, or interact with blocks & entities';
    }

    function getObtainDependencies(itemName) {
        const deps = {
            'milk_bucket': [{ item: 'bucket', consumed: true }],
            'water_bucket': [{ item: 'bucket', consumed: true }],
            'lava_bucket': [{ item: 'bucket', consumed: true }],
            'powder_snow_bucket': [{ item: 'bucket', consumed: true }],
            'axolotl_bucket': [{ item: 'water_bucket', consumed: true }],
            'cod_bucket': [{ item: 'water_bucket', consumed: true }],
            'salmon_bucket': [{ item: 'water_bucket', consumed: true }],
            'tropical_fish_bucket': [{ item: 'water_bucket', consumed: true }],
            'pufferfish_bucket': [{ item: 'water_bucket', consumed: true }],
            'honey_bottle': [{ item: 'glass_bottle', consumed: true }],
            'dragon_breath': [{ item: 'glass_bottle', consumed: true }],
            'water_bottle': [{ item: 'glass_bottle', consumed: true }],
            'potion': [{ item: 'glass_bottle', consumed: true }],
            'mushroom_stew': [{ item: 'bowl', consumed: true }],
            'suspicious_stew': [{ item: 'bowl', consumed: true }, { item: 'dandelion', consumed: true }],
            'honeycomb': [{ item: 'shears', consumed: false }],
        };

        if (deps[itemName]) return deps[itemName];

        if (itemName.endsWith('_pottery_sherd')) {
            return [{ item: 'brush', consumed: false }];
        }
        
        return [];
    }

    function resolveItem(item, amountNeeded) {
        let available = simulated_inventory[item] || 0;
        if (available >= amountNeeded) return;
        if (active_resolutions.has(item)){
            return;
        } 
        active_resolutions.add(item);

        let needed = amountNeeded - available;

        // --- SPECIAL CASE: Redirect Planks to Logs ---
        if (item.endsWith('_planks')) {
            const woodType = item.replace('_planks', ''); 
            const logType = `${woodType}_log`;
            
            const logsNeeded = Math.ceil(needed / 4);
            const planksYielded = logsNeeded * 4; 
            
            resolveItem(logType, logsNeeded);
            simulated_inventory[logType] -= logsNeeded;
            
            const woodNote = getWoodNote(item);
            addStep({
                type: 'craft',
                item: item,
                amount: logsNeeded,
                recipeId: 'planks_from_logs',
                ingredients: [{ name: logType, amount: logsNeeded }],
                woodNote: woodNote,
                needsTable: false
            });
            
            simulated_inventory[item] = (simulated_inventory[item] || 0) + planksYielded;
            active_resolutions.delete(item);
            return;
        }

        // --- ROUTE C: Animal Drops ---
        let animalSource = getItemAnimalSource(item);
        if (animalSource) {
            addStep({
                type: 'hunt',
                item: item,
                source: animalSource,
                amount: needed
            });
            simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
            active_resolutions.delete(item);
            return;
        }

        // --- ROUTE B: Smelting ---
        let smeltIngredient = getItemSmeltingIngredient(item);
        if (smeltIngredient) {
            resolveItem(smeltIngredient, needed);
            const fuelUsed = resolveFuel(needed);
            
            // NEW: Check for Furnace
            if ((simulated_inventory['furnace'] || 0) <= 0) {
                resolveItem('furnace', 1);
                simulated_inventory['furnace'] = 1;
            }

            addStep({
                type: 'smelt',
                item: item,
                amount: needed,
                ingredient: smeltIngredient,
                fuel: fuelUsed.name,
                fuelAmount: fuelUsed.amount
            });
            simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
            active_resolutions.delete(item);
            return;
        }

        // --- ROUTE A: CRAFTING ---
        const isNaturalResource = isBaseItem(item); 
        const recipes = getItemCraftingRecipes(item);

        if (!isNaturalResource && recipes && recipes.length > 0) {
            let [recipe, result] = recipes[0];
            let yieldCount = result.craftedCount || 1;
            let batches = Math.ceil(needed / yieldCount);
            let ingredientsUsed = [];

            for (let [ingName, ingCount] of Object.entries(recipe)) {
                const totalIngNeeded = ingCount * batches;
                
                resolveItem(ingName, totalIngNeeded);
                simulated_inventory[ingName] -= totalIngNeeded;
                
                ingredientsUsed.push({ name: ingName, amount: totalIngNeeded });
            }

            const needsTable = requiresCraftingTable(mcdata.recipes[getItemId(item)][0]);
            
            if (needsTable) {
                if ((simulated_inventory['crafting_table'] || 0) <= 0) {
                    resolveItem('crafting_table', 1);
                    simulated_inventory['crafting_table'] = 1;
                }
            }

            const woodNote = getWoodNote(item);
            addStep({
                type: 'craft',
                item: item,
                amount: batches,
                recipeId: getItemId(item),
                ingredients: ingredientsUsed,
                woodNote: woodNote,
                needsTable: needsTable
            });
            
            simulated_inventory[item] = (simulated_inventory[item] || 0) + (batches * yieldCount);
            active_resolutions.delete(item);
            return;
        }

        // --- ROUTE D: MINING / COLLECTING ---
        let blockSources = getItemBlockSources(item);
        if (isNaturalResource || blockSources.length > 0 || mcdata.blocksByName[item]) {
            let targetBlock = blockSources.length > 0 ? blockSources[0] : item;
            let requiredTool = requireTool(targetBlock);

            if (requiredTool !== undefined) {
                const woodNote = getWoodNote(targetBlock); 
                let toolToUse = null;

                if (requiredTool !== null) {
                    toolToUse = getBestToolInInventory(requiredTool);
                    if (!toolToUse) {
                        resolveItem(requiredTool, 1);
                        toolToUse = requiredTool; 
                    }
                }
                
                addStep({
                    type: 'collect',
                    item: item,
                    targetBlock: targetBlock,
                    amount: needed,
                    tool: toolToUse,
                    woodNote: woodNote
                });
                
                simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
                active_resolutions.delete(item);
                return;
            }
        }

        // --- FINAL FALLBACK (OBTAIN) ---
        const obtainDeps = getObtainDependencies(item);
        for (const dep of obtainDeps) {
            const depAmount = dep.consumed ? needed : 1;
            
            let hasNonConsumed = false;
            if (!dep.consumed) {
                if ((simulated_inventory[dep.item] || 0) >= 1) {
                    hasNonConsumed = true;
                }
            }

            if (!hasNonConsumed) {
                resolveItem(dep.item, depAmount);
                if (dep.consumed) {
                    simulated_inventory[dep.item] -= needed;
                }
            }
        }

        addStep({
            type: 'obtain',
            item: item,
            amount: needed
        });
        simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
        
        active_resolutions.delete(item);
    }

    resolveItem(targetItem, count);

    // ==========================================
    // FINAL PASS: Format steps and handle blocks
    // ==========================================
    let formattedSteps = [];
    let tablePlaced = false;
    let furnacePlaced = false;

    function pushFormattedStep(desc) {
        formattedSteps.push({
            step_id: `step_${step_count++}`,
            description: desc,
            status: "pending"
        });
    }

    for (let i = 0; i < steps.length; i++) {
        let step = steps[i];
        
        // --- Handle Crafting Table ---
        if (step.type === 'craft' && step.needsTable) {
            if (!tablePlaced) {
                pushFormattedStep(`Place down the crafting_table`);
                tablePlaced = true;
            }
        } else if (step.type !== 'craft' || !step.needsTable) {
            if (tablePlaced) {
                pushFormattedStep(`Collect the crafting table`);
                tablePlaced = false;
            }
        }

        // --- Handle Furnace ---
        if (step.type === 'smelt') {
            if (!furnacePlaced) {
                pushFormattedStep(`Place down the furnace`);
                furnacePlaced = true;
            }
        } else {
            if (furnacePlaced) {
                pushFormattedStep(`Collect the furnace`);
                furnacePlaced = false;
            }
        }

        // --- Format Step Descriptions ---
        if (step.type === 'collect') {
            let toolStr = step.tool ? `using ${step.tool}` : `by hand`;
            if (step.woodNote) {
                step.targetBlock = 'log';
                step.item = 'log'
            }
            if (step.targetBlock === step.item) {
                pushFormattedStep(`Collect ${step.amount} ${step.targetBlock} ${step.woodNote}`);
            } else {
                pushFormattedStep(`Collect ${step.amount} ${step.targetBlock} to get ${step.amount} ${step.item}${step.woodNote}`);
            }
        } else if (step.type === 'craft') {
            let ingStrings = step.ingredients.map(ing => `${ing.amount} ${ing.name}`);
            let ingDesc = ingStrings.length > 0 ? ` from ${ingStrings.join(' and ')}` : '';
            if (step.woodNote){
                pushFormattedStep(`Craft ${step.amount} ${step.item.split('_').slice(-1)[0]}${step.woodNote}`);
            }else{
                pushFormattedStep(`Craft ${step.amount} ${step.item}${ingDesc}${step.woodNote}`);
            }
        } else if (step.type === 'smelt') {
            pushFormattedStep(`Smelt ${step.amount} ${step.ingredient} using ${step.fuelAmount} ${step.fuel} into ${step.item}`);
        } else if (step.type === 'hunt') {
            pushFormattedStep(`Hunt ${step.source} to collect ${step.amount} ${step.item}`);
        } else if (step.type === 'obtain') {
            const obtainMethod = getCustomObtainMethod(step.item);
            pushFormattedStep(`Obtain ${step.amount} ${step.item} (${obtainMethod})`);
        } else if (step.type === 'text') {
            pushFormattedStep(step.description);
        }
    }

    // Ensure blocks are collected at the very end if still placed
    if (tablePlaced) {
        pushFormattedStep(`Collect the crafting table`);
    }
    if (furnacePlaced) {
        pushFormattedStep(`Collect the furnace`);
    }

    if (formattedSteps.length > 0) {
        formattedSteps[0].status = "in_progress";
    }

    return JSON.stringify({ steps: formattedSteps }, null, 2);
}

// console.log(createPlan("cherry_fence", 1, {"crafting_table":1, "furnace": 1}))
// console.log(getItemCraftingRecipes("dark_oak_planks"))